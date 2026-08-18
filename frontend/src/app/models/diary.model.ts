export interface DiaryEntryIn {
  title?: string;
  content: string;
}

export interface DiaryEntryListItem {
  id: string;
  title: string | null;
  content_preview: string;
  created_at: string;
  updated_at: string;
}

export interface DiaryEntryOut {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}
