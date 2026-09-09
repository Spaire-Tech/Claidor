import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import type { LocalizedQuickAction } from '../../types/quickAction';

interface QuickActionState {
  /** Quick actions with their texts */
  actions: LocalizedQuickAction[];
  /** Selected action id */
  selectedActionId: string | null;
  /** Selected prompt id */
  selectedPromptId: string | null;
  /** Loading flag */
  isLoading: boolean;
}

const initialState: QuickActionState = {
  actions: [],
  selectedActionId: null,
  selectedPromptId: null,
  isLoading: false,
};

const quickActionSlice = createSlice({
  name: 'quickAction',
  initialState,
  reducers: {
    /** Set the quick actions */
    setActions: (state, action: PayloadAction<LocalizedQuickAction[]>) => {
      state.actions = action.payload;
    },
    /** Select a quick action */
    selectAction: (state, action: PayloadAction<string | null>) => {
      state.selectedActionId = action.payload;
      // Clear the prompt selection when the action changes
      state.selectedPromptId = null;
    },
    /** Select a prompt */
    selectPrompt: (state, action: PayloadAction<string | null>) => {
      state.selectedPromptId = action.payload;
    },
    /** Set the loading flag */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    /** Clear the selection */
    clearSelection: (state) => {
      state.selectedActionId = null;
      state.selectedPromptId = null;
    },
  },
});

export const {
  setActions,
  selectAction,
  selectPrompt,
  setLoading,
  clearSelection,
} = quickActionSlice.actions;

export default quickActionSlice.reducer;
