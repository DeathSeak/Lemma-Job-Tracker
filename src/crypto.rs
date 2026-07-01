// Security layer for the Lemma Job Tracker using AES-256-GCM encryption.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};

use rand::{rngs::OsRng, RngCore};
use thiserror::Error;

// Standard AES-GCM 12-byte nonce length.
const NONCE_LEN: usize = 12;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("AES-GCM encryption failed: {0}")]
    Encryption(String),
    #[error("AES-GCM decryption failed: {0}")]
    Decryption(String),
}

impl From<aes_gcm::Error> for CryptoError {
    fn from(e: aes_gcm::Error) -> Self {
        CryptoError::Encryption(e.to_string())
    }
}

// Encrypt byte payload with AES-256-GCM returning [nonce (12B) || ciphertext+tag].
pub fn encrypt_payload(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    // Generate random 12-byte nonce.
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Perform AES-GCM encryption.
    let ciphertext = cipher.encrypt(nonce, data)?;

    // Combine nonce and ciphertext into a single payload.
    let mut payload = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

// Decrypt payload by extracting the nonce and verifying the ciphertext tag.
pub fn decrypt_payload(payload: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
    if payload.len() < NONCE_LEN {
        return Err(CryptoError::Decryption("payload shorter than nonce".into()));
    }
    let (nonce_bytes, ciphertext) = payload.split_at(NONCE_LEN);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| CryptoError::Decryption(e.to_string()))
}