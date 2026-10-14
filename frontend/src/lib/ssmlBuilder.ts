/**
 * Teaching Voice Style Engine - SSML Builder Utility
 * 
 * Transforms Azure AI Foundry Agent JSON responses and voice metadata into 
 * valid Azure Neural TTS SSML XML strings with prosody and express-as styling.
 */

export interface VoiceMetadata {
  style?: 
    | 'teacher' 
    | 'mentor' 
    | 'friendly' 
    | 'motivational' 
    | 'encouraging' 
    | 'empathetic' 
    | 'storytelling' 
    | 'interviewer' 
    | 'professional'
    | 'career_coach'
    | 'exam_preparation'
    | 'conversational';
  emotion?: 
    | 'neutral' 
    | 'calm' 
    | 'friendly' 
    | 'cheerful' 
    | 'empathetic' 
    | 'excited' 
    | 'hopeful' 
    | 'confident' 
    | 'serious' 
    | 'gentle' 
    | 'warm';
  level?: 'beginner' | 'intermediate' | 'advanced';
  prosody?: {
    rate?: string; // e.g. "slow", "-15%", "0%", "+5%"
    pitch?: string; // e.g. "low", "-3%", "+5%", "normal"
    volume?: string;
    pause_level?: 'short' | 'medium' | 'long';
  };
  voiceName?: string;
}

export interface AgentJsonResponse {
  response_text: string;
  voice_metadata?: VoiceMetadata;
}

/**
 * Checks whether a given string is already formatted as SSML XML.
 */
export function isSsml(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.startsWith('<speak') && trimmed.endsWith('</speak>');
}

/**
 * Parses raw Agent output string which may be raw text or a JSON string.
 */
export function parseAgentOutput(rawOutput: string): { responseText: string; metadata?: VoiceMetadata } {
  if (!rawOutput) return { responseText: '' };
  
  const trimmed = rawOutput.trim();
  
  // If already SSML, return as-is
  if (isSsml(trimmed)) {
    return { responseText: trimmed };
  }

  // Attempt JSON parse
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed: AgentJsonResponse = JSON.parse(trimmed);
      if (parsed.response_text) {
        return {
          responseText: parsed.response_text,
          metadata: parsed.voice_metadata
        };
      }
    } catch {
      // Fallback to raw text if JSON parse fails
    }
  }

  return { responseText: trimmed };
}

/**
 * Generates valid Azure SSML XML from text and voice metadata presets.
 */
export function formatToSsml(text: string, metadata?: VoiceMetadata): string {
  if (!text) return '';
  if (isSsml(text)) return text;

  const voiceName = metadata?.voiceName || 'en-US-CoraMultilingualNeural';
  const level = metadata?.level || 'intermediate';

  // 1. Determine Azure Express-As Style Tag & Intensity
  let styleTag = 'friendly';
  let styleDegree = '1.0';
  let defaultRate = '0%';
  let defaultPitch = '0%';
  let defaultPause = '300ms';

  const requestedStyle = metadata?.style || 'teacher';

  switch (requestedStyle) {
    case 'teacher':
      if (level === 'beginner') {
        styleTag = 'friendly';
        defaultRate = '-15%';
        defaultPause = '450ms';
      } else {
        styleTag = 'narration-professional';
        defaultRate = '0%';
        defaultPause = '250ms';
      }
      break;
    case 'motivational':
      styleTag = 'cheerful';
      styleDegree = '1.4';
      defaultRate = '+5%';
      defaultPitch = '+5%';
      defaultPause = '200ms';
      break;
    case 'encouraging':
      styleTag = 'cheerful';
      styleDegree = '1.1';
      defaultRate = '0%';
      defaultPitch = '+3%';
      defaultPause = '250ms';
      break;
    case 'empathetic':
      styleTag = 'empathetic';
      styleDegree = '1.2';
      defaultRate = '-12%';
      defaultPitch = '-2%';
      defaultPause = '450ms';
      break;
    case 'storytelling':
      styleTag = 'narration-relaxed';
      defaultRate = '-8%';
      defaultPitch = '+3%';
      defaultPause = '500ms';
      break;
    case 'interviewer':
      styleTag = 'serious';
      defaultRate = '0%';
      defaultPitch = '-3%';
      defaultPause = '350ms';
      break;
    case 'professional':
    case 'career_coach':
    case 'exam_preparation':
      styleTag = 'narration-professional';
      defaultRate = '-5%';
      defaultPause = '300ms';
      break;
    case 'friendly':
    case 'conversational':
    default:
      styleTag = 'friendly';
      defaultRate = '0%';
      defaultPause = '250ms';
      break;
  }

  // Override emotion if specified
  if (metadata?.emotion) {
    switch (metadata.emotion) {
      case 'calm':
        styleTag = 'calm';
        defaultRate = '-8%';
        break;
      case 'cheerful':
      case 'excited':
        styleTag = 'cheerful';
        styleDegree = '1.3';
        defaultRate = '+5%';
        break;
      case 'empathetic':
      case 'gentle':
        styleTag = 'empathetic';
        defaultRate = '-10%';
        break;
      case 'serious':
      case 'confident':
        styleTag = 'serious';
        break;
    }
  }

  // 2. Resolve Prosody Overrides
  let finalRate = defaultRate;
  if (metadata?.prosody?.rate) {
    if (metadata.prosody.rate === 'slow') finalRate = '-15%';
    else if (metadata.prosody.rate === 'fast') finalRate = '+10%';
    else if (metadata.prosody.rate === 'normal') finalRate = '0%';
    else finalRate = metadata.prosody.rate;
  }

  let finalPitch = defaultPitch;
  if (metadata?.prosody?.pitch) {
    if (metadata.prosody.pitch === 'low') finalPitch = '-5%';
    else if (metadata.prosody.pitch === 'high') finalPitch = '+5%';
    else if (metadata.prosody.pitch === 'normal') finalPitch = '0%';
    else finalPitch = metadata.prosody.pitch;
  }

  let pauseDuration = defaultPause;
  if (metadata?.prosody?.pause_level === 'long') pauseDuration = '500ms';
  if (metadata?.prosody?.pause_level === 'short') pauseDuration = '200ms';

  // Escape special XML characters in text before wrapping
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Inject natural pauses after sentence endings
  const punctuatedText = escapedText.replace(/([.?!])\s+/g, `$1 <break time="${pauseDuration}"/> `);

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${voiceName}"><mstts:express-as style="${styleTag}" styledegree="${styleDegree}"><prosody rate="${finalRate}" pitch="${finalPitch}">${punctuatedText}</prosody></mstts:express-as></voice></speak>`;
}

/**
 * Main helper: takes raw agent string output and guarantees valid SSML string out.
 */
export function processAgentTextForTTS(agentOutput: string, defaultMetadata?: VoiceMetadata): string {
  const { responseText, metadata } = parseAgentOutput(agentOutput);
  const effectiveMetadata = { ...defaultMetadata, ...metadata };
  return formatToSsml(responseText, effectiveMetadata);
}
