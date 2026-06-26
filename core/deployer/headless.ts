#!/usr/bin/env node
/**
 * Headless deployer CLI entry point.
 * Runs a recipe deployment without instantiating the full txAdmin stack.
 *
 * Usage:
 *   node deployer/headless.ts --recipe <path|url> --target <deployPath> [--var key=value ...]
 *   npx tsx deployer/headless.ts --recipe <path|url> --target <deployPath>
 *
 * Options:
 *   --recipe    Path to a local YAML recipe file or a URL to download one
 *   --target    Target directory for deployment
 *   --name      Server name (default: 'headless-deploy')
 *   --var       Variable in key=value format (can be repeated)
 *   --trusted   Mark recipe source as trusted (default: false)
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Deployer } from './index';
import { nanoid } from 'nanoid';
import got from 'got';
import { assertSafeRemoteRecipeUrl } from '../lib/remoteRecipeDownloadUrl.js';

const parseArgs = (argv: string[]) => {
    const args = argv.slice(2);
    const parsed: {
        recipe?: string;
        target?: string;
        name: string;
        trusted: boolean;
        vars: Record<string, string>;
    } = {
        name: 'headless-deploy',
        trusted: false,
        vars: {},
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--recipe' && args[i + 1]) {
            parsed.recipe = args[++i];
        } else if (arg === '--target' && args[i + 1]) {
            parsed.target = args[++i];
        } else if (arg === '--name' && args[i + 1]) {
            parsed.name = args[++i];
        } else if (arg === '--trusted') {
            parsed.trusted = true;
        } else if (arg === '--var' && args[i + 1]) {
            const kv = args[++i];
            const eqIdx = kv.indexOf('=');
            if (eqIdx === -1) {
                console.error(`Invalid --var format: "${kv}" (expected key=value)`);
                process.exit(1);
            }
            parsed.vars[kv.slice(0, eqIdx)] = kv.slice(eqIdx + 1);
        }
    }

    return parsed;
};

const main = async () => {
    const args = parseArgs(process.argv);

    if (!args.recipe || !args.target) {
        console.error(
            'Usage: headless --recipe <path|url> --target <deployPath> [--var key=value ...] [--name name] [--trusted]',
        );
        process.exit(1);
    }

    //Resolve recipe text
    let recipeText: string;
    if (args.recipe.startsWith('http://') || args.recipe.startsWith('https://')) {
        let recipeUrl: URL;
        try {
            recipeUrl = assertSafeRemoteRecipeUrl(args.recipe);
        } catch (err: any) {
            console.error(err?.message ?? String(err));
            process.exit(1);
        }
        console.log(`Downloading recipe from ${recipeUrl.href}...`);
        recipeText = await got(recipeUrl, {
            timeout: { request: 30_000 },
            followRedirect: true,
            maxRedirects: 5,
        }).text();
    } else {
        const recipePath = path.resolve(args.recipe);
        console.log(`Loading recipe from ${recipePath}...`);
        recipeText = await fsp.readFile(recipePath, 'utf8');
    }

    //Create deployer instance
    const deploymentID = nanoid(16);
    const targetPath = path.resolve(args.target);
    console.log(`Deployment ID: ${deploymentID}`);
    console.log(`Target path: ${targetPath}`);

    const deployer = new Deployer(recipeText, deploymentID, targetPath, args.trusted, {
        serverName: args.name,
        author: 'headless',
        txaVersion: 'headless',
    });

    //Confirm recipe (skip review step)
    console.log(`Recipe: ${deployer.recipe.name} by ${deployer.recipe.author}`);
    console.log(`Tasks: ${deployer.recipe.tasks.length}`);
    deployer.confirmRecipe(recipeText);

    //Set user variables
    deployer.start(args.vars);

    //Wait for completion by polling
    await new Promise<void>((resolve, reject) => {
        const poll = setInterval(() => {
            if (deployer.step === 'configure') {
                clearInterval(poll);
                resolve();
            } else if (deployer.deployFailed) {
                clearInterval(poll);
                reject(new Error('Deployment failed'));
            }
        }, 500);
    });

    console.log('\n' + deployer.getDeployerLog());
    if (deployer.deployFailed) {
        console.error('Deployment FAILED.');
        process.exit(1);
    } else {
        console.log('Deployment completed successfully!');
        console.log(`Files deployed to: ${targetPath}`);
    }
};

main().catch((error) => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});
