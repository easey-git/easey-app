# React Native Cross-Platform UI/UX Best Practices

## 1. Layout Architecture

### "ResponsiveContainer" Pattern
Never hardcode widths. Use a container that restrains content width on large screens to prevent "stretched" UI.

```javascript
// Good
<View style={{ flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' }}>
  {children}
</View>
```

### Grid vs List
- **Mobile**: Single column (List)
- **Tablet**: 2 Columns (Grid)
- **Desktop**: 3+ Columns (Grid)
- Use `FlatList`'s `numColumns` and `key` props to switch layout dynamically.

## 2. Spacing & Sizing

### 8-Point Grid
All margins and paddings should be multiples of 8 (8, 16, 24, 32, 48).
- `4px`: Hairline separation
- `8px`: Related items
- `16px`: Component padding
- `24px`: Section separation

### Touch Targets
- **Mobile**: Minimum 48x48dp for all interactive elements.
- **Desktop**: Can be smaller (32dp), but 40dp+ is safer for hybrid touch screens.

## 3. Typography

Scale font sizes slightly for desktop readability if needed, but rely on `react-native-paper` variants (`bodyLarge`, `titleMedium`, etc.) which handle hierarchy well.
Avoid hardcoded numeric font sizes (e.g., `fontSize: 14`). Use theme constants.

## 4. Platform Specifics

Use `Platform.select` sparingly. Prefer cleaner abstractions like hooks (`useResponsive`).

## 5. Navigation

- **Mobile**: Bottom Tabs or Drawer (Hamburger).
- **Desktop**: Persistent Left Sidebar or Top Navigation Bar.
- Do not use a hamburger menu on desktop unless necessary for secondary actions.
