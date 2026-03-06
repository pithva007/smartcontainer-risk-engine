import type { RiskLevel } from './apiTypes';

export type ConversationStatus = 'Open' | 'Pending Documents' | 'Resolved';

export interface ChatContainerInfo {
  container_id: string;
  risk_level: RiskLevel | null;
  risk_score?: number | null;
  origin_country?: string | null;
  destination_port?: string | null;
  destination_country?: string | null;
}

export interface ConversationListItem {
  id: string;
  conversation_id: string;
  container_id: string;
  status: ConversationStatus;
  updated_at: string;
  risk_level: RiskLevel | null;
  unread_count: number;
  last_message: null | {
    preview: string;
    timestamp: string;
    sender: 'Admin' | 'Exporter' | 'System';
  };
  participants?: {
    exporter?: string;
    admin?: string;
  };
}

export type SenderRole = 'admin' | 'officer' | 'viewer' | 'system';

export interface ChatMessage {
  message_id: string;
  sender_id: string;
  sender_role: SenderRole;
  sender_name?: string;
  message_text: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_mime?: string;
  timestamp: string;
}

export interface StartConversationResponse {
  success: boolean;
  conversation: {
    id: string;
    conversation_id: string;
    container_id: string;
    exporter_id?: string | null;
    admin_id?: string | null;
    created_at: string;
    updated_at: string;
    container: ChatContainerInfo;
  };
}

