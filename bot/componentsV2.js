const {
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} = require('discord.js');

const isPlainObject = (value) => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const mergeFlags = (flags, nextFlag) => {
    const numericFlags = Number(flags);
    if (Number.isInteger(numericFlags)) {
        return numericFlags | nextFlag;
    }

    return nextFlag;
};

const resolveUpdateFlags = (flags) => {
    const numericFlags = Number(flags);
    if (!Number.isInteger(numericFlags)) return undefined;

    const filteredFlags = numericFlags & MessageFlags.IsComponentsV2;
    return filteredFlags || undefined;
};

const normalizeString = (value) => {
    return typeof value === 'string' ? value.trim() : '';
};

const buildHeadingDisplays = (embed) => {
    const displays = [];
    if (isPlainObject(embed.author) && typeof embed.author.name === 'string' && embed.author.name.length) {
        const authorLine = typeof embed.author.url === 'string' && embed.author.url.length
            ? `**[${embed.author.name}](${embed.author.url})**`
            : `**${embed.author.name}**`;
        displays.push(authorLine);
    }

    if (typeof embed.title === 'string' && embed.title.length) {
        const titleLine = typeof embed.url === 'string' && embed.url.length
            ? `## [${embed.title}](${embed.url})`
            : `## ${embed.title}`;
        displays.push(titleLine);
    } else if (typeof embed.url === 'string' && embed.url.length) {
        displays.push(embed.url);
    }

    if (typeof embed.description === 'string' && embed.description.length) {
        displays.push(embed.description);
    }

    return displays;
};

const buildFieldText = (field) => {
    if (!isPlainObject(field)) return null;
    if (typeof field.name !== 'string' || !field.name.length) return null;
    if (typeof field.value !== 'string' || !field.value.length) return null;

    return `**${field.name}**\n${field.value}`;
};

const buildFooterText = (embed) => {
    const footerParts = [];
    if (isPlainObject(embed.footer) && typeof embed.footer.text === 'string' && embed.footer.text.length) {
        footerParts.push(embed.footer.text);
    }

    const parsedTimestamp = typeof embed.timestamp === 'string' || typeof embed.timestamp === 'number'
        ? Date.parse(String(embed.timestamp))
        : NaN;
    if (Number.isFinite(parsedTimestamp)) {
        footerParts.push(`<t:${Math.floor(parsedTimestamp / 1000)}:F>`);
    }

    return footerParts.join(' • ');
};

const buildSeparatorComponent = () => {
    return new SeparatorBuilder({
        divider: true,
        spacing: SeparatorSpacingSize.Small,
    }).toJSON();
};

const addTextDisplay = (container, content) => {
    if (typeof content !== 'string' || !content.length) return false;

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
    return true;
};

const addSeparator = (container) => {
    container.addSeparatorComponents(new SeparatorBuilder(buildSeparatorComponent()));
};

const addEmbedMedia = (container, embed) => {
    const imageUrl = isPlainObject(embed.image) && typeof embed.image.url === 'string' && embed.image.url.length
        ? embed.image.url
        : null;
    if (!imageUrl) return false;

    const mediaItem = new MediaGalleryItemBuilder().setURL(imageUrl);
    if (typeof embed.title === 'string' && embed.title.length) {
        mediaItem.setDescription(embed.title);
    }

    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(mediaItem));
    return true;
};

const buildCardHeadingDisplays = (title, body) => {
    const displays = [];
    const normalizedTitle = normalizeString(title);
    const normalizedBody = normalizeString(body);

    if (normalizedTitle.length) {
        displays.push(`## ${normalizedTitle}`);
    }

    if (normalizedBody.length) {
        displays.push(normalizedBody);
    }

    return displays;
};

const appendPlainActionRows = (containerJson, actionRows) => {
    if (!Array.isArray(actionRows) || !actionRows.length) return;

    if (Array.isArray(containerJson.components) && containerJson.components.length) {
        containerJson.components.push(buildSeparatorComponent());
    }

    containerJson.components.push(...actionRows);
};

const buildCardMessage = (options = {}) => {
    const container = new ContainerBuilder();
    if (typeof options.accentColor === 'number') {
        container.setAccentColor(options.accentColor);
    }

    const headingDisplays = buildCardHeadingDisplays(options.title, options.body);
    const thumbnailUrl = normalizeString(options.thumbnailUrl);
    let hasContent = false;

    if (headingDisplays.length && thumbnailUrl.length) {
        const section = new SectionBuilder();
        for (const content of headingDisplays.slice(0, 3)) {
            section.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        }
        section.setThumbnailAccessory(
            new ThumbnailBuilder({
                media: { url: thumbnailUrl },
            }),
        );
        container.addSectionComponents(section);
        hasContent = true;
    } else {
        for (const content of headingDisplays) {
            hasContent = addTextDisplay(container, content) || hasContent;
        }
    }

    const sectionTexts = Array.isArray(options.sections)
        ? options.sections
            .map((section) => normalizeString(section))
            .filter((section) => section.length)
        : [];
    for (const sectionText of sectionTexts) {
        if (hasContent) {
            addSeparator(container);
        }
        addTextDisplay(container, sectionText);
        hasContent = true;
    }

    const footerText = normalizeString(options.footer);
    if (footerText.length) {
        if (hasContent) {
            addSeparator(container);
        }
        addTextDisplay(container, `*${footerText}*`);
        hasContent = true;
    }

    if (!hasContent) {
        addTextDisplay(container, 'No content.');
    }

    const containerJson = container.toJSON();
    appendPlainActionRows(containerJson, options.actionRows);

    return {
        ...(Array.isArray(options.files) && options.files.length ? { files: options.files } : {}),
        components: [containerJson],
        flags: mergeFlags(options.flags, MessageFlags.IsComponentsV2),
        ...(isPlainObject(options.allowedMentions) ? { allowedMentions: options.allowedMentions } : {}),
    };
};

const embedToComponent = (embed) => {
    if (!isPlainObject(embed)) return null;

    const container = new ContainerBuilder();
    if (typeof embed.color === 'number') {
        container.setAccentColor(embed.color);
    }

    let hasContent = false;
    const headingDisplays = buildHeadingDisplays(embed);
    const thumbnailUrl = isPlainObject(embed.thumbnail) && typeof embed.thumbnail.url === 'string' && embed.thumbnail.url.length
        ? embed.thumbnail.url
        : null;
    if (headingDisplays.length && thumbnailUrl) {
        const section = new SectionBuilder();
        for (const content of headingDisplays.slice(0, 3)) {
            section.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
        }
        section.setThumbnailAccessory(
            new ThumbnailBuilder({
                media: { url: thumbnailUrl },
            }),
        );
        container.addSectionComponents(section);
        hasContent = true;
    } else {
        for (const content of headingDisplays) {
            hasContent = addTextDisplay(container, content) || hasContent;
        }
    }

    const fieldTexts = Array.isArray(embed.fields)
        ? embed.fields
            .map((field) => buildFieldText(field))
            .filter((fieldText) => typeof fieldText === 'string' && fieldText.length)
        : [];
    for (const fieldText of fieldTexts) {
        if (hasContent) {
            addSeparator(container);
        }
        addTextDisplay(container, fieldText);
        hasContent = true;
    }

    if (addEmbedMedia(container, embed)) {
        if (hasContent) {
            addSeparator(container);
        }
        hasContent = true;
    }

    const footerText = buildFooterText(embed);
    if (footerText.length) {
        if (hasContent) {
            addSeparator(container);
        }
        addTextDisplay(container, `*${footerText}*`);
        hasContent = true;
    }

    if (!hasContent && thumbnailUrl) {
        const mediaItem = new MediaGalleryItemBuilder().setURL(thumbnailUrl);
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(mediaItem));
        hasContent = true;
    }

    return hasContent ? container.toJSON() : null;
};

const normalizeMessagePayload = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

    const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
    if (!embeds.length) return payload;

    const components = [];
    if (typeof payload.content === 'string' && payload.content.length) {
        components.push(new TextDisplayBuilder().setContent(payload.content).toJSON());
    }

    for (const embed of embeds) {
        const component = embedToComponent(embed);
        if (component) {
            components.push(component);
        }
    }

    if (Array.isArray(payload.components) && payload.components.length) {
        const lastContainer = components.at(-1);
        if (lastContainer && Array.isArray(lastContainer.components)) {
            appendPlainActionRows(lastContainer, payload.components);
        } else {
            components.push(...payload.components);
        }
    }

    const normalizedPayload = {
        ...payload,
        components,
        flags: mergeFlags(payload.flags, MessageFlags.IsComponentsV2),
    };
    delete normalizedPayload.content;
    delete normalizedPayload.embeds;

    return normalizedPayload;
};

const normalizeMessageEditPayload = (payload) => {
    const normalizedPayload = normalizeMessagePayload(payload);
    if (!normalizedPayload || typeof normalizedPayload !== 'object' || Array.isArray(normalizedPayload)) {
        return normalizedPayload;
    }

    const numericFlags = Number(normalizedPayload.flags);
    if (!Number.isInteger(numericFlags) || !(numericFlags & MessageFlags.IsComponentsV2)) {
        return normalizedPayload;
    }

    return {
        ...normalizedPayload,
        content: null,
        embeds: [],
    };
};

const normalizeInteractionUpdatePayload = (payload) => {
    const normalizedPayload = normalizeMessagePayload(payload);
    if (!normalizedPayload || typeof normalizedPayload !== 'object' || Array.isArray(normalizedPayload)) {
        return normalizedPayload;
    }

    const updatePayload = {
        ...normalizedPayload,
    };

    const updateFlags = resolveUpdateFlags(normalizedPayload.flags);
    if (updateFlags === undefined) {
        delete updatePayload.flags;
        return updatePayload;
    }

    updatePayload.flags = updateFlags;
    return updatePayload;
};

module.exports = {
    buildCardMessage,
    normalizeMessageEditPayload,
    normalizeInteractionUpdatePayload,
    normalizeMessagePayload,
};