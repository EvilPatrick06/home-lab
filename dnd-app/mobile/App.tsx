import './global.css'
import { NavigationContainer, type Theme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import { useEffect, type ReactElement } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { initStorage } from '@app/storage/storage-adapter'
import type { RootStackParamList } from '@app/navigation/types'
import CharactersScreen from '@app/screens/CharactersScreen'
import GameSessionScreen from '@app/screens/GameSessionScreen'
import JoinGameScreen from '@app/screens/JoinGameScreen'
import LibraryScreen from '@app/screens/LibraryScreen'
import MainMenuScreen from '@app/screens/MainMenuScreen'
import SettingsScreen from '@app/screens/SettingsScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()

// Dark theme matching the desktop/web palette so navigation chrome blends in.
const darkTheme: Theme = {
  dark: true,
  colors: {
    primary: '#fbbf24',
    background: '#030712',
    card: '#111827',
    text: '#f3f4f6',
    border: '#374151',
    notification: '#ef4444'
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '800' }
  }
}

export default function App(): ReactElement {
  useEffect(() => {
    // Open/create the on-device SQLite store before any screen reads from it.
    initStorage().catch((e) => console.warn('[storage] init failed', e))
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <NavigationContainer theme={darkTheme}>
          <Stack.Navigator
            initialRouteName="MainMenu"
            screenOptions={{
              headerStyle: { backgroundColor: '#030712' },
              headerTintColor: '#fbbf24',
              contentStyle: { backgroundColor: '#030712' }
            }}
          >
            <Stack.Screen name="MainMenu" component={MainMenuScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Characters" component={CharactersScreen} options={{ title: 'Characters' }} />
            <Stack.Screen name="Library" component={LibraryScreen} options={{ title: 'Library' }} />
            <Stack.Screen name="JoinGame" component={JoinGameScreen} options={{ title: 'Join Game' }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
            <Stack.Screen
              name="GameSession"
              component={GameSessionScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
