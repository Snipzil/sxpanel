import type { MsgFn } from './processEmbed';

const PREVIEW_MESSAGE_DEFAULTS: Record<string, string> = {
    'errors.invalid_url_details': 'URLs must start with https://, http://, or discord://.',
    'errors.invalid_placeholder_details': 'Unresolved placeholders cannot be used in URLs.',
    'errors.invalid_emoji_details': 'Use a Unicode emoji, custom emoji ID, or <:name:id> syntax.',
    'errors.invalid_url': 'Invalid URL: %{url}',
    'errors.empty_url': 'URL cannot be empty.',
    'errors.invalid_status_color': 'Invalid status color: %{value}',
    'errors.empty_status_color': 'Status color cannot be empty.',
    'errors.footer_object': 'Embed footer must be an object.',
    'errors.footer_text': 'Embed footer text cannot be empty.',
    'errors.author_object': 'Embed author must be an object.',
    'errors.author_name': 'Embed author name cannot be empty.',
    'errors.media_object': 'Embed %{sectionName} must be an object.',
    'errors.fields_array': 'Embed fields must be an array.',
    'errors.field_object': 'Each embed field must be an object.',
    'errors.field_name': 'Embed field name cannot be empty.',
    'errors.field_value': 'Embed field value cannot be empty.',
    'errors.field_inline': 'Embed field inline must be a boolean.',
    'errors.embed_object': 'Embed JSON must be an object.',
    'errors.title_string': 'Embed title must be a string.',
    'errors.description_string': 'Embed description must be a string.',
    'errors.too_many_buttons': 'A maximum of 5 buttons is allowed.',
    'errors.invalid_button_config': 'Each button must include a non-empty label and url.',
    'errors.button_label_empty': 'Button label cannot be empty after placeholder substitution.',
    'errors.invalid_button_emoji': 'Invalid emoji for button %{label}: %{details}',
    'errors.embed_json_error': 'Embed JSON error: %{message}',
    'errors.embed_config_error': 'Embed config JSON error: %{message}',
    'errors.embed_class_error': 'Embed validation error: %{message}',
    'errors.embed_buttons_error': 'Embed buttons error: %{message}',
    'pager.prev': 'Prev',
    'pager.next': 'Next',
    'pager.page_label': 'Page {{playerListPage}}/{{playerListTotalPages}}',
    empty_player_list: 'No players online.',
    player_list_summary: '%{count} players online',
    player_list_page_summary_empty: 'No players to display.',
    player_list_page_summary: 'Page %{currentPage}/%{totalPages} • Showing %{startNumber}-%{endNumber}',
};

const applyTemplate = (template: string, data: Record<string, unknown> = {}) => {
    let output = template;
    for (const [key, value] of Object.entries(data)) {
        output = output.replaceAll(`%{${key}}`, String(value));
    }
    return output;
};

export const createPreviewMsgFn = (): MsgFn => {
    return (key: string, data: Record<string, unknown> = {}) => {
        const template = PREVIEW_MESSAGE_DEFAULTS[key] ?? key;
        return applyTemplate(template, data);
    };
};
