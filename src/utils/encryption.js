const CryptoJS = require("crypto-js");
const config = require("../config");

/**
 * Encryption utility for securing sensitive data (tokens)
 * Uses AES-256 encryption
 */

class Encryption {
  constructor() {
    this.key = config.encryptionKey;
    if (!this.key || this.key.length < 32) {
      console.warn(
        "WARNING: Encryption key is not set or too short. Using default key (NOT SECURE FOR PRODUCTION)",
      );
      this.key =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    }
  }

  /**
   * Encrypt a string
   * @param {string} text - Plain text to encrypt
   * @returns {string} - Encrypted text (base64)
   */
  encrypt(text) {
    if (!text) return null;
    try {
      const encrypted = CryptoJS.AES.encrypt(text, this.key).toString();
      return encrypted;
    } catch (error) {
      console.error("Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  /**
   * Decrypt a string
   * @param {string} encryptedText - Encrypted text (base64)
   * @returns {string} - Decrypted plain text
   */
  decrypt(encryptedText) {
    if (!encryptedText) return null;
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.key);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (!decrypted) {
        throw new Error("Decryption resulted in empty string");
      }
      return decrypted;
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error("Failed to decrypt data");
    }
  }
}

module.exports = new Encryption();
