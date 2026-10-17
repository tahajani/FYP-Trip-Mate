import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'auth_token';

const isWeb = Platform.OS === 'web';

export const saveToken = async (token: string) => {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
};

export const getToken = async () => {
  if (isWeb) {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  }
  return SecureStore.getItemAsync(KEY);
};

export const removeToken = async () => {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
};