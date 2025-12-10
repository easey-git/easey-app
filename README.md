# 🚀 Easey CRM Mobile App

A beautiful, lightweight CRM mobile application built with React Native and Expo for personal business management.

## ✨ Features

- 📱 Beautiful, modern UI with gradient designs
- 👥 Customer Management (Add, View, Search, Delete)
- 📞 Quick Actions (Call, WhatsApp, Email)
- 💾 Local data storage with AsyncStorage
- 🔍 Real-time search functionality
- 🎨 Premium design with smooth animations

## 🛠️ Tech Stack

- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform
- **React Navigation** - Screen navigation
- **AsyncStorage** - Local data persistence
- **Expo Linear Gradient** - Beautiful gradients

## 🏃 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm start
```

This will open Expo DevTools. You can:
- Scan the QR code with **Expo Go** app on your Android phone
- Press `a` to open in Android emulator (if installed)

### 3. Test on Your Phone (Recommended)

**Without Android Studio - Using Expo Go:**
1. Install **Expo Go** from Google Play Store
2. Run `npm start`
3. Scan the QR code with Expo Go app
4. App will load instantly on your phone!

## 📦 Building APK

### Method 1: EAS Build (Cloud - No Android Studio Required) ⭐ RECOMMENDED

1. **Create Expo Account** (Free):
   ```bash
   npx eas-cli login
   ```

2. **Configure Project**:
   ```bash
   npx eas-cli build:configure
   ```

3. **Build APK**:
   ```bash
   npx eas-cli build --platform android --profile preview
   ```

4. Wait 5-10 minutes and download your APK!

### Method 2: Local Build (Requires Android SDK)

If you want to build locally:
```bash
npm run android
```

## 📱 App Structure

```
src/
├── screens/
│   ├── HomeScreen.js          # Dashboard with menu
│   ├── CustomersScreen.js     # Customer list with search
│   ├── AddCustomerScreen.js   # Add new customer form
│   └── CustomerDetailScreen.js # Customer details & actions
```

## 🎯 Usage

### Adding a Customer
1. Navigate to Customers screen
2. Tap the "+" button
3. Fill in customer details
4. Save

### Searching Customers
- Use the search bar to filter by name, phone, or email

### Customer Actions
- **Tap** - View customer details
- **Long press** - Delete customer
- **Detail screen** - Call, WhatsApp, or Email customer

## 🔧 Customization

### Change App Name
Edit `app.json`:
```json
{
  "expo": {
    "name": "Your App Name",
    "slug": "your-app-name"
  }
}
```

### Change App Icon
Replace files in the `assets/` folder with your own images.

### Add More Features
The app structure makes it easy to add:
- Orders management
- Products catalog
- Analytics dashboard
- Firebase sync

## 📝 Data Storage

- All data is stored locally using AsyncStorage
- No internet connection required
- Data persists between app restarts
- To add cloud sync, integrate Firebase/Supabase

## 🚀 Next Steps

### Recommended Enhancements:
1. **Firebase Integration** - Cloud sync across devices
2. **Orders Module** - Track customer orders
3. **Products Catalog** - Manage inventory
4. **Analytics** - Sales reports and insights
5. **Export Data** - CSV/Excel export
6. **Photos** - Add customer/product images

## 🤝 Development Tips

### Installing New Packages
```bash
npm install <package-name>
```

### Clear Cache
```bash
npx expo start --clear
```

### Check Logs
```bash
npx expo start
# Then press 'j' to open debugger
```

## 📄 Build Commands Reference

```bash
# Development
npm start                    # Start Expo dev server
npm run android             # Open in Android
npm run web                 # Open in browser

# Building APK
npx eas-cli login           # Login to Expo
npx eas-cli build -p android --profile preview  # Build APK
npx eas-cli build:list      # Check build status
```

## 🎨 Design Philosophy

This app follows modern mobile design principles:
- **Clean & Minimal** - Focus on functionality
- **Vibrant Gradients** - Eye-catching UI
- **Smooth Animations** - Premium feel
- **Easy Navigation** - Intuitive flow

## 📞 Support

For issues or questions:
1. Check Expo documentation: https://docs.expo.dev
2. React Navigation docs: https://reactnavigation.org

## 📄 License

Free for personal use. Built with ❤️ for small businesses.

---

**Made with Expo + React Native** 🚀
