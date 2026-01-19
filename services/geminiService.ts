
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getAIDJCommentary = async (audioSnippetDescription: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a cool, knowledgeable AI DJ for a platform called SonicStream. 
      The host is currently playing audio which sounds like: "${audioSnippetDescription}". 
      Give a short, punchy reaction or comment (max 2 sentences) to keep the listeners hyped. 
      Be witty, music-savvy, and engaging.`,
      config: {
        temperature: 0.8,
        topP: 0.9,
      }
    });
    // Ensure we return a default string if response.text is undefined
    return response.text || "The vibe is immaculate right now! Keep the music coming.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The vibe is immaculate right now! Keep the music coming.";
  }
};

export const analyzeVibe = async (history: string[]) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Based on this chat history: ${history.join(", ")}, summarize the current 'room vibe' in exactly 3-4 words. Examples: 'Nostalgic Jazz Nights', 'High Energy Techno', 'Chill Lo-Fi Morning'.`,
    });
    // Ensure we return a default string if response.text is undefined
    return response.text || "Sonic Stream Session";
  } catch (error) {
    console.error("Gemini Vibe Analysis Error:", error);
    return "Sonic Stream Session";
  }
};
