import { registerRootComponent } from 'expo';
import notifee from '@notifee/react-native';
import App from './App';
import { handleNotificationEvent } from './src/notify';

// background/quit-state notification events (approve/deny buttons)
notifee.onBackgroundEvent(handleNotificationEvent);

// foreground service: keeps JS runtime (and the WS connection) alive in background;
// the returned promise intentionally never resolves until stopForegroundService()
notifee.registerForegroundService(() => new Promise(() => { }));

registerRootComponent(App);
