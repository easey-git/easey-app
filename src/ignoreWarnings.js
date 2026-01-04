import { LogBox } from 'react-native';

LogBox.ignoreLogs([
    'Expo AV has been deprecated',
    'TouchableMixin',
    'onStartShouldSetResponder',
    'onResponderGrant',
    'onResponderRelease',
    'onResponderMove',
    'onResponderTerminationRequest',
    'onPressOut',
    'Animated: useNativeDriver',
    'Blocked aria-hidden',
    'props.pointerEvents is deprecated',
    'shadow',
    'Listening to push token changes'
]);
