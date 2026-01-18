import { LogBox } from 'react-native';

const ignoreWarns = [
    'Expo AV has been deprecated',
    'TouchableMixin',
    'onStartShouldSetResponder',
    'onResponderGrant',
    'onResponderRelease',
    'onResponderMove',
    'onResponderTerminationRequest',
    'onResponderTerminate',
    'Event handler property',
    'onPressOut',
    'Animated: `useNativeDriver`',
    'Blocked aria-hidden',
    'props.pointerEvents is deprecated',
    '"shadow*" style props',
    'Listening to push token changes',
    'Unexpected text node'
];

LogBox.ignoreLogs(ignoreWarns);

// Filter console logs on Web/Dev
if (typeof window !== 'undefined' && window.console) {
    const originalWarn = console.warn;
    const originalError = console.error;

    console.warn = (...args) => {
        const log = args.join(' ');
        if (ignoreWarns.some(pattern => log.includes(pattern))) return;
        originalWarn(...args);
    };

    console.error = (...args) => {
        const log = args.join(' ');
        if (ignoreWarns.some(pattern => log.includes(pattern))) return;
        originalError(...args);
    };
}
