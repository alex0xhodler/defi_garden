/**
 * Real-time APY message updater for seamless UX
 * Shows immediate response, then updates with fresh data
 */

import { BotContext } from '../context';
import { getImmediateAPY, getConsistentAPY } from './consistent-apy';
import { InlineKeyboard } from 'grammy';

export interface APYMessageTemplate {
  generateMessage: (apy: number, isLoading: boolean) => string;
  keyboard?: InlineKeyboard;
}

/**
 * Sends a message to the user with the best available APY, providing an immediate response
 * from the cache and then updating the message asynchronously if fresher data becomes available.
 * @param {BotContext} ctx - The bot context.
 * @param {APYMessageTemplate} template - An object containing a function to generate the message content.
 * @param {string} [userId] - The user's ID for fetching contextual APY.
 * @returns {Promise<void>}
 */
export async function sendMessageWithRealtimeAPY(
  ctx: BotContext,
  template: APYMessageTemplate,
  userId?: string
): Promise<void> {
  // Step 1: Get immediate response
  const immediate = await getImmediateAPY(userId);
  
  // Step 2: Send initial message
  const initialMessage = template.generateMessage(immediate.apy, immediate.isLoading);
  const sentMessage = await ctx.reply(initialMessage, {
    parse_mode: "Markdown",
    reply_markup: template.keyboard
  });

  // Step 3: If loading, fetch fresh data and update
  if (immediate.isLoading) {
    console.log(`📡 Real-time APY update needed for user ${userId} (confidence: ${immediate.confidence.toFixed(2)})`);
    
    // Get fresh data in background
    try {
      const fresh = await getConsistentAPY(userId, 'initial');
      
      // Only update if APY actually changed
      if (Math.abs(fresh - immediate.apy) > 0.01) {
        const updatedMessage = template.generateMessage(fresh, false);
        
        await ctx.api.editMessageText(
          ctx.chat?.id || 0,
          sentMessage.message_id,
          updatedMessage,
          {
            parse_mode: "Markdown",
            reply_markup: template.keyboard
          }
        );
        
        console.log(`✅ Real-time APY updated: ${immediate.apy}% → ${fresh}% for user ${userId}`);
      } else {
        console.log(`ℹ️ No APY update needed (same value: ${fresh}%) for user ${userId}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to update APY message for user ${userId}:`, error);
      // Don't fail the user experience - initial message is still valid
    }
  } else {
    console.log(`⚡ High confidence APY shown immediately (${immediate.apy}%) for user ${userId}`);
  }
}

/**
 * Edits an existing message to display the best available APY.
 * Like `sendMessageWithRealtimeAPY`, it provides an immediate update from the cache
 * and then a second update if fresher data is fetched successfully.
 * @param {BotContext} ctx - The bot context.
 * @param {APYMessageTemplate} template - An object containing a function to generate the message content.
 * @param {string} [userId] - The user's ID for fetching contextual APY.
 * @returns {Promise<void>}
 */
export async function editMessageWithRealtimeAPY(
  ctx: BotContext,
  template: APYMessageTemplate,
  userId?: string
): Promise<void> {
  // Step 1: Get immediate response
  const immediate = await getImmediateAPY(userId);
  
  // Step 2: Edit with initial data
  const initialMessage = template.generateMessage(immediate.apy, immediate.isLoading);
  
  try {
    await ctx.editMessageText(initialMessage, {
      parse_mode: "Markdown",
      reply_markup: template.keyboard
    });
  } catch (error) {
    // If edit fails, send new message instead
    await sendMessageWithRealtimeAPY(ctx, template, userId);
    return;
  }

  // Step 3: If loading, fetch fresh data and update again
  if (immediate.isLoading) {
    console.log(`📡 Real-time APY edit update needed for user ${userId}`);
    
    try {
      const fresh = await getConsistentAPY(userId, 'initial');
      
      if (Math.abs(fresh - immediate.apy) > 0.01) {
        const updatedMessage = template.generateMessage(fresh, false);
        
        await ctx.editMessageText(updatedMessage, {
          parse_mode: "Markdown",
          reply_markup: template.keyboard
        });
        
        console.log(`✅ Real-time APY edit updated: ${immediate.apy}% → ${fresh}%`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to update edited APY message:`, error);
    }
  }
}

/**
 * A helper function to append a loading indicator to a message string.
 * @param {string} baseText - The base message text.
 * @returns {string} The text with a loading indicator appended.
 */
export function createLoadingIndicator(baseText: string): string {
  return `${baseText}\n\n⏳ *Getting latest rates...*`;
}

/**
 * A helper function to remove a loading indicator from a message string.
 * @param {string} text - The message text containing a loading indicator.
 * @returns {string} The text with the loading indicator removed.
 */
export function removeLoadingIndicator(text: string): string {
  return text.replace(/\n\n⏳ \*Getting latest rates\.\.\.\*/, '');
}