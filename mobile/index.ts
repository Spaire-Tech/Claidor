import { registerRootComponent } from "expo";

import App from "./src/App";
import { keepNotificationsQuietInTheForeground } from "./src/native/push";

// Before anything can arrive: no banner while Simeon is open.
keepNotificationsQuietInTheForeground();

// AppRegistry.registerComponent("main", () => App), set up for Expo Go and native builds alike.
registerRootComponent(App);
