import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Sessions: undefined;
  Chat: { sessionId: string };
  NewSession: { presetPrompt?: string } | undefined;
  Settings: undefined;
};

export type NavProp = NativeStackNavigationProp<RootStackParamList>;
