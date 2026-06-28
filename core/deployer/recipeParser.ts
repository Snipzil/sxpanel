const modulename = 'Deployer';
import * as YAML from 'js-yaml';
import recipeEngine from './recipeEngine';
import consoleFactory from '@lib/console';
import { RECIPE_DEPLOYER_VERSION } from './consts';
import { YamlRecipeSchema, type ParsedRecipe, type RecipeEngineMap } from './recipeTypes';
const console = consoleFactory(modulename);

const typedEngine = recipeEngine as RecipeEngineMap;
const protectedVarNames = ['licenseKey', 'dbHost', 'dbUsername', 'dbPassword', 'dbName', 'dbConnection', 'dbPort'];

/**
 * Parses and validates a recipe YAML string into a ParsedRecipe
 */
const recipeParser = (rawRecipe: string, fxsVersion?: number): ParsedRecipe => {
    if (typeof rawRecipe !== 'string') throw new Error('not a string');

    //Load YAML
    let rawYaml: unknown;
    try {
        rawYaml = YAML.load(rawRecipe, { schema: YAML.JSON_SCHEMA });
    } catch (error) {
        console.verbose.dir(error);
        throw new Error('invalid yaml');
    }

    //Validate schema with zod
    const parseResult = YamlRecipeSchema.safeParse(rawYaml);
    if (!parseResult.success) {
        const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
        throw new Error(`Recipe validation failed:\n${issues.join('\n')}`);
    }
    const recipe = parseResult.data;

    //Prepare output
    const outRecipe: ParsedRecipe = {
        raw: rawRecipe.trim(),
        name: (recipe.name ?? 'unnamed').trim(),
        author: (recipe.author ?? 'unknown').trim(),
        description: (recipe.description ?? '').trim(),
        variables: {},
        tasks: [],
        requireDBConfig: false,
    };

    //Check meta tag requirements
    if (recipe.$onesync) {
        outRecipe.onesync = recipe.$onesync;
    }
    if (recipe.$minFxVersion !== undefined) {
        if (fxsVersion !== undefined && recipe.$minFxVersion > fxsVersion) {
            throw new Error(`this recipe requires FXServer v${recipe.$minFxVersion} or above`);
        }
        outRecipe.fxserverMinVersion = recipe.$minFxVersion;
    }
    if (recipe.$engine !== undefined) {
        if (recipe.$engine < RECIPE_DEPLOYER_VERSION) {
            throw new Error(`unsupported '$engine' version ${recipe.$engine}`);
        }
        outRecipe.recipeEngineVersion = recipe.$engine;
    }
    if (recipe.$steamRequired === true) {
        outRecipe.steamRequired = true;
    }
    if (recipe.$requiresGithubToken === true) {
        outRecipe.requiresGithubToken = true;
    }

    //Validate tasks
    for (const [index, task] of recipe.tasks.entries()) {
        if (typeof typedEngine[task.action] === 'undefined') {
            throw new Error(`[task${index + 1}] unknown action '${task.action}'`);
        }
        if (!typedEngine[task.action].validate(task)) {
            throw new Error(`[task${index + 1}:${task.action}] invalid parameters`);
        }
        outRecipe.tasks.push(task);
    }

    //Process variables
    outRecipe.requireDBConfig = recipe.tasks.some((t) => t.action.includes('database'));
    if (recipe.variables) {
        const varNames = Object.keys(recipe.variables);
        if (varNames.some((n) => protectedVarNames.includes(n))) {
            throw new Error('recipe variables cannot use reserved names (licenseKey, db*)');
        }
        Object.assign(outRecipe.variables, recipe.variables);
    }

    return outRecipe;
};

export default recipeParser;
