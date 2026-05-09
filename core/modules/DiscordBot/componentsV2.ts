const discordComponentType = {
    section: 9,
    textDisplay: 10,
    thumbnail: 11,
    mediaGallery: 12,
    separator: 14,
    container: 17,
} as const;

const separatorSpacing = {
    small: 1,
} as const;

export const discordMessageFlagIsComponentsV2 = 1 << 15;

type PlainObject = Record<string, unknown>;

type DiscordCardSection = {
    body: string;
};

type DiscordCardOptions = {
    accentColor?: number;
    eyebrow?: string;
    title?: string;
    titleUrl?: string;
    body?: string;
    thumbnailUrl?: string;
    imageUrl?: string;
    sections?: DiscordCardSection[];
    footer?: string;
    actionRows?: Record<string, unknown>[];
    flags?: number;
    allowedMentions?: PlainObject;
};

const isPlainObject = (value: unknown): value is PlainObject => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const normalizeString = (value: unknown) => {
    return typeof value === 'string' ? value.trim() : '';
};

const mergeFlags = (flags: unknown, nextFlag: number) => {
    const numericFlags = Number(flags);
    if (Number.isInteger(numericFlags)) {
        return numericFlags | nextFlag;
    }

    return nextFlag;
};

const buildTextDisplay = (content: string) => {
    return {
        type: discordComponentType.textDisplay,
        content,
    };
};

const buildSeparator = () => {
    return {
        type: discordComponentType.separator,
        divider: true,
        spacing: separatorSpacing.small,
    };
};

const buildHeaderDisplays = (options: DiscordCardOptions) => {
    const displays = [] as string[];

    if (options.eyebrow?.length) {
        displays.push(`**${options.eyebrow}**`);
    }

    if (options.title?.length) {
        displays.push(`## ${options.title}`);
    } else if (options.titleUrl?.length) {
        displays.push(options.titleUrl);
    }

    if (options.body?.length) {
        displays.push(options.body);
    }

    return displays;
};

const appendCardBlock = (containerComponents: PlainObject[], content: string) => {
    if (!content.length) return;

    if (containerComponents.length) {
        containerComponents.push(buildSeparator());
    }

    containerComponents.push(buildTextDisplay(content));
};

const appendActionRows = (containerComponents: PlainObject[], actionRows: Record<string, unknown>[] | undefined) => {
    if (!Array.isArray(actionRows) || !actionRows.length) return;

    if (containerComponents.length) {
        containerComponents.push(buildSeparator());
    }

    containerComponents.push(...actionRows);
};

const buildDiscordCardContainer = (options: DiscordCardOptions) => {
    const containerComponents = [] as PlainObject[];
    const headerDisplays = buildHeaderDisplays(options);

    if (headerDisplays.length) {
        if (options.thumbnailUrl?.length) {
            containerComponents.push({
                type: discordComponentType.section,
                components: headerDisplays.slice(0, 3).map((content) => buildTextDisplay(content)),
                accessory: {
                    type: discordComponentType.thumbnail,
                    media: {
                        url: options.thumbnailUrl,
                    },
                },
            });
        } else {
            containerComponents.push(...headerDisplays.map((content) => buildTextDisplay(content)));
        }
    }

    for (const section of options.sections ?? []) {
        appendCardBlock(containerComponents, section.body.trim());
    }

    if (options.imageUrl?.length) {
        if (containerComponents.length) {
            containerComponents.push(buildSeparator());
        }

        containerComponents.push({
            type: discordComponentType.mediaGallery,
            items: [
                {
                    media: {
                        url: options.imageUrl,
                    },
                },
            ],
        });
    }

    appendActionRows(containerComponents, options.actionRows);

    if (options.footer?.length) {
        appendCardBlock(containerComponents, `*${options.footer}*`);
    }

    return {
        type: discordComponentType.container,
        ...(typeof options.accentColor === 'number' ? { accent_color: options.accentColor } : {}),
        components: containerComponents.length ? containerComponents : [buildTextDisplay('No content.')],
    };
};

export const buildDiscordCardMessage = (options: DiscordCardOptions) => {
    return {
        flags: mergeFlags(options.flags, discordMessageFlagIsComponentsV2),
        components: [buildDiscordCardContainer(options)],
        ...(options.allowedMentions ? { allowedMentions: options.allowedMentions } : {}),
    };
};

const formatFieldContent = (field: PlainObject) => {
    const name = normalizeString(field.name);
    const value = normalizeString(field.value);
    if (!value.length) return null;
    if (!name.length || name === '\u200b') return value;

    return `**${name}**\n${value}`;
};

const buildFieldSections = (fields: unknown) => {
    if (!Array.isArray(fields)) return [];

    const sections = [] as DiscordCardSection[];

    for (const rawField of fields) {
        if (!isPlainObject(rawField)) continue;

        const content = formatFieldContent(rawField);
        if (!content) continue;
        sections.push({ body: content });
    }
    return sections;
};

const buildFooterText = (embed: PlainObject) => {
    const footerParts = [] as string[];

    if (isPlainObject(embed.footer)) {
        const footerText = normalizeString(embed.footer.text);
        if (footerText.length) {
            footerParts.push(footerText);
        }
    }

    const timestampValue = embed.timestamp;
    const parsedTimestamp = typeof timestampValue === 'string' || typeof timestampValue === 'number'
        ? Date.parse(String(timestampValue))
        : Number.NaN;
    if (Number.isFinite(parsedTimestamp)) {
        footerParts.push(`<t:${Math.floor(parsedTimestamp / 1000)}:F>`);
    }

    return footerParts.join(' • ');
};

export const buildDiscordCardMessageFromEmbed = (
    embed: PlainObject,
    options?: {
        actionRows?: Record<string, unknown>[];
        flags?: number;
        allowedMentions?: PlainObject;
    },
) => {
    const authorName = isPlainObject(embed.author) ? normalizeString(embed.author.name) : '';
    const authorUrl = isPlainObject(embed.author) ? normalizeString(embed.author.url) : '';
    const thumbnailUrl = isPlainObject(embed.thumbnail) ? normalizeString(embed.thumbnail.url) : '';
    const imageUrl = isPlainObject(embed.image) ? normalizeString(embed.image.url) : '';

    return buildDiscordCardMessage({
        accentColor: typeof embed.color === 'number' ? embed.color : undefined,
        eyebrow: authorName.length ? authorName : undefined,
        title: normalizeString(embed.title),
        titleUrl: normalizeString(embed.url),
        body: normalizeString(embed.description),
        thumbnailUrl: thumbnailUrl.length ? thumbnailUrl : undefined,
        imageUrl: imageUrl.length ? imageUrl : undefined,
        sections: buildFieldSections(embed.fields),
        footer: buildFooterText(embed) || undefined,
        actionRows: options?.actionRows,
        flags: options?.flags,
        allowedMentions: options?.allowedMentions,
    });
};

export const buildDiscordCardMessageFromEmbeds = (
    embeds: PlainObject[],
    options?: {
        actionRows?: Record<string, unknown>[];
        flags?: number;
        allowedMentions?: PlainObject;
    },
) => {
    const containers = embeds
        .filter((embed): embed is PlainObject => isPlainObject(embed))
        .map((embed) => {
            const authorName = isPlainObject(embed.author) ? normalizeString(embed.author.name) : '';
            const authorUrl = isPlainObject(embed.author) ? normalizeString(embed.author.url) : '';
            const thumbnailUrl = isPlainObject(embed.thumbnail) ? normalizeString(embed.thumbnail.url) : '';
            const imageUrl = isPlainObject(embed.image) ? normalizeString(embed.image.url) : '';

            return buildDiscordCardContainer({
                accentColor: typeof embed.color === 'number' ? embed.color : undefined,
                eyebrow: authorName.length ? authorName : undefined,
                title: normalizeString(embed.title),
                titleUrl: normalizeString(embed.url),
                body: normalizeString(embed.description),
                thumbnailUrl: thumbnailUrl.length ? thumbnailUrl : undefined,
                imageUrl: imageUrl.length ? imageUrl : undefined,
                sections: buildFieldSections(embed.fields),
                footer: buildFooterText(embed) || undefined,
            });
        });

    return {
        flags: mergeFlags(options?.flags, discordMessageFlagIsComponentsV2),
        components: [...containers, ...(options?.actionRows ?? [])],
        ...(options?.allowedMentions ? { allowedMentions: options.allowedMentions } : {}),
    };
};