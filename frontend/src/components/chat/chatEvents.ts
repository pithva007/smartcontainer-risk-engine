export const OPEN_CHAT_EVENT = 'smartcontainer:open-chat';

export function openChatForContainer(containerId?: string, exporterId?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { containerId, exporterId } }));
}

