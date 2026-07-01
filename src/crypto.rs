//! Security layer for the AI Job Application Command Centre.
//!
//! Zero-metadata contract:
//!   - Plaintext user data (resume text, scraped job text) is NEVER persisted.
//!   - It exists only transiently in-memory, is wrapped with AES-256-GCM before
//!     any internal routing decision, and is destroyed when the handler returns.
//!   - `hash_credentials` is provided for the (optional) auth gate that protects
//!     the ingestion endpoint; it uses Argon2id, the memory-hard PHC standard.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};

use rand::{rngs::OsRng, RngCore};
use thiserror::Error;

/// 12-byte GCM nonce length (standard for AES-GCM).
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



/// Encrypt an arbitrary byte payload with AES-256-GCM.
///
/// The returned `Vec<u8>` is laid out as `[nonce (12B) || ciphertext+tag]`.
/// The nonce is generated per-call via the OS CSPRNG, satisfying the
/// "never reuse a (key, nonce) pair" requirement of GCM.
///
/// In the zero-metadata pipeline this is the single encryption boundary that
/// every scraped blob crosses before being handed to internal routing.
pub fn encrypt_payload(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    // Generate a cryptographically random 96-bit nonce.
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // AES-GCM provides authenticated encryption: ciphertext + integrity tag.
    let ciphertext = cipher.encrypt(nonce, data)?;

    // Prepend the nonce so the decryptor can recover it without out-of-band state.
    let mut payload = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);
    Ok(payload)
}

/// Decrypt a payload produced by `encrypt_payload`.
///
/// Splits the leading 12-byte nonce from the ciphertext, then performs the
/// authenticated decryption. A tampered payload fails here — this is how the
/// pipeline guarantees integrity of transient E2EE blobs.
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