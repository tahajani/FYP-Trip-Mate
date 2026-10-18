import { useState } from 'react';
import { View, Text, TextInput, Pressable, TextInputProps } from 'react-native';
import { authStyles as s } from './auth-styles';

type Props = TextInputProps & { label: string; isPassword?: boolean };

export default function AuthField({ label, isPassword, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);

  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={[s.inputWrap, focused && s.inputFocused]}>
        <TextInput
          style={s.input}
          placeholderTextColor="#94a3b8"
          secureTextEntry={isPassword && hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />
        {isPassword && (
          <Pressable style={s.toggle} onPress={() => setHidden((h) => !h)}>
            <Text style={s.toggleText}>{hidden ? 'Show' : 'Hide'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}