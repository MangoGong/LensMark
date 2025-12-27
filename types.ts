import React from 'react';

export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum Language {
  EN = 'en',
  ZH = 'zh',
  JA = 'ja',
  KO = 'ko',
  ES = 'es',
  DE = 'de',
  FR = 'fr',
}

export enum BannerStyle {
  BLACK = 'black',
  WHITE = 'white',
  BLUR = 'blur',
  ADAPTIVE = 'adaptive',
}

export interface ExifData {
  make: string;
  model: string;
  lens: string;
  focalLength: string;
  fNumber: string;
  iso: string;
  exposureTime: string;
  dateTime: string;
  gps?: string;
  lat?: number;
  lon?: number;
}

export type Side = 'left' | 'right' | 'off';
export type Line = 1 | 2;
export type LogoPosition = 'left' | 'right'; // Left of Left block, or Left of Right block

export interface WatermarkElement {
  id: string;
  label: string;
  text: string;
  side: Side;
  line: Line;
  order: number;
}

export interface WatermarkSettings {
  elements: {
    model: WatermarkElement;
    lens: WatermarkElement;
    focalLength: WatermarkElement;
    fNumber: WatermarkElement;
    iso: WatermarkElement;
    exposureTime: WatermarkElement;
    date: WatermarkElement;
    gps: WatermarkElement;
  };
  bannerStyle: BannerStyle;
  blurIntensity: number;
  useOriginalDate: boolean;
  selectedLogoKey: string;
  customLogoSvg: string | null;
  logoPosition: LogoPosition; 
  useAdaptiveTextColor: boolean; // New setting
}

export interface LogoDef {
  id: string;
  label: string;
}