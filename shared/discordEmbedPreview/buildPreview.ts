import jsonForgivingParse from '../jsonForgivingParse';
import { emsg } from '../emsg';
import type { DiscordCardMessagePayload } from './componentsV2';
import {
    buildMockEmbedPlaceholders,
    PREVIEW_DEFAULT_FOOTER,
    type PreviewHealth,
    type PreviewVariant,
} from './mockPlaceholders';
import { MOCK_PREVIEW_PLAYERS } from './mockPlayers';
import {
    assembleDiscordEmbedMessage,
    buildPlayerListPlaceholderDataFromPlayers,
    playerListInlineSeparatorFallback,
    type PlainObject,
} from './processEmbed';
import { createPreviewMsgFn } from './previewMessages';
import { substitutePlaceholdersDeep } from './substitutePlaceholders';

export type BuildDiscordEmbedPreviewResult = {
    payload?: DiscordCardMessagePayload;
    error?: string;
};

export type BuildDiscordEmbedPreviewParams = {
    embedJson: string;
    embedConfigJson: string;
    variant: PreviewVariant;
    health?: PreviewHealth;
    playerListPage?: number;
};

const parseJsonObject = (raw: string, errorKey: string, msg: ReturnType<typeof createPreviewMsgFn>) => {
    try {
        const parsed = jsonForgivingParse(raw);
        if (!(parsed instanceof Object) || Array.isArray(parsed)) {
            throw new Error('not an Object');
        }
        return parsed as PlainObject;
    } catch (error) {
        throw new Error(msg(errorKey, { message: emsg(error) }));
    }
};

export const buildDiscordEmbedPreview = ({
    embedJson,
    embedConfigJson,
    variant,
    health = 'online',
    playerListPage = 1,
}: BuildDiscordEmbedPreviewParams): BuildDiscordEmbedPreviewResult => {
    const msg = createPreviewMsgFn();

    try {
        const embedJsonObject = parseJsonObject(embedJson, 'errors.embed_json_error', msg);
        const embedConfigObject = parseJsonObject(embedConfigJson, 'errors.embed_config_error', msg);

        const playerListData = buildPlayerListPlaceholderDataFromPlayers(
            embedConfigObject,
            MOCK_PREVIEW_PLAYERS,
            msg,
            playerListPage,
        );

        const placeholders = buildMockEmbedPlaceholders(
            embedConfigObject,
            {
                playerList: playerListData.playerList,
                playerListColumns: playerListData.playerListColumns.join(playerListInlineSeparatorFallback),
                playerListInline: playerListData.playerListInline,
                playerListSummary: playerListData.playerListSummary,
                playerListPage: playerListData.playerListPage,
                playerListTotalPages: playerListData.playerListTotalPages,
                playerListPageSummary: playerListData.playerListPageSummary,
            },
            health,
        );

        const { messagePayload } = assembleDiscordEmbedMessage({
            embedJson: embedJsonObject,
            embedConfigJson: embedConfigObject,
            placeholders,
            playerListData,
            msg,
            options: {
                expandPlayerListFields: variant === 'playerList',
                includePlayerListPager: variant === 'playerList',
                defaultFooter: PREVIEW_DEFAULT_FOOTER,
                previewLenient: true,
            },
        });

        const payload = substitutePlaceholdersDeep(messagePayload, placeholders) as DiscordCardMessagePayload;

        return { payload };
    } catch (error) {
        return { error: emsg(error) };
    }
};
