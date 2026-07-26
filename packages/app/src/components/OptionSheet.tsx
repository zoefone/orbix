import React, { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { Theme } from '../theme';

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

/** pill button that opens a bottom-sheet option list */
export default function OptionPill({ label, options, value, onChange, theme }: {
  label: string;
  options: Option[];
  value?: string;
  onChange: (id: string) => void;
  theme: Theme;
}) {
  const t = theme;
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, maxWidth: 170,
      }}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: t.ink2, flexShrink: 1 }}>{label}</Text>
        <Text style={{ fontSize: 9, color: t.ink3 }}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30, maxHeight: 420 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.ink3, alignSelf: 'center', marginBottom: 12, opacity: 0.5 }} />
            <ScrollView>
              {options.map(o => (
                <TouchableOpacity key={o.id} onPress={() => { onChange(o.id); setOpen(false); }}
                  style={{ paddingVertical: 13, paddingHorizontal: 10, borderRadius: 12, backgroundColor: value === o.id ? t.card2 : 'transparent' }}>
                  <Text style={{ fontSize: 15, fontWeight: value === o.id ? '700' : '500', color: t.ink }}>{o.label}</Text>
                  {!!o.hint && <Text style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>{o.hint}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
