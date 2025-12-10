import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TextInput, Button, HelperText } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AddCustomerScreen({ navigation }) {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [errors, setErrors] = useState({});

    const validate = () => {
        const newErrors = {};
        if (!name.trim()) newErrors.name = 'Name is required';
        if (!phone.trim()) newErrors.phone = 'Phone is required';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const saveCustomer = async () => {
        if (!validate()) return;

        try {
            const newCustomer = {
                id: Date.now().toString(),
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                address: address.trim(),
                notes: notes.trim(),
                createdAt: new Date().toISOString(),
            };

            const stored = await AsyncStorage.getItem('customers');
            const customers = stored ? JSON.parse(stored) : [];
            customers.push(newCustomer);
            await AsyncStorage.setItem('customers', JSON.stringify(customers));

            navigation.goBack();
        } catch (error) {
            console.error('Failed to save customer:', error);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.form}>
                <TextInput
                    label="Customer Name *"
                    value={name}
                    onChangeText={setName}
                    mode="outlined"
                    style={styles.input}
                    error={!!errors.name}
                />
                <HelperText type="error" visible={!!errors.name}>
                    {errors.name}
                </HelperText>

                <TextInput
                    label="Phone Number *"
                    value={phone}
                    onChangeText={setPhone}
                    mode="outlined"
                    keyboardType="phone-pad"
                    style={styles.input}
                    error={!!errors.phone}
                />
                <HelperText type="error" visible={!!errors.phone}>
                    {errors.phone}
                </HelperText>

                <TextInput
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    mode="outlined"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                />

                <TextInput
                    label="Address"
                    value={address}
                    onChangeText={setAddress}
                    mode="outlined"
                    multiline
                    numberOfLines={3}
                    style={styles.input}
                />

                <TextInput
                    label="Notes"
                    value={notes}
                    onChangeText={setNotes}
                    mode="outlined"
                    multiline
                    numberOfLines={3}
                    style={styles.input}
                />

                <View style={styles.buttonContainer}>
                    <Button
                        mode="outlined"
                        onPress={() => navigation.goBack()}
                        style={styles.button}
                    >
                        Cancel
                    </Button>
                    <Button
                        mode="contained"
                        onPress={saveCustomer}
                        style={styles.button}
                    >
                        Save Customer
                    </Button>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    form: {
        padding: 16,
    },
    input: {
        marginBottom: 8,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    button: {
        flex: 1,
    },
});
