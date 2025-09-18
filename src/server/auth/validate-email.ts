import { l } from '@/lib/clients/logger'
import { serializeError } from 'serialize-error'

/**
 * Response type from the ZeroBounce email validation API
 */
export type EmailValidationResponse = {
  address: string
  status: string
  sub_status: string
  free_email: boolean
  account: string
  domain: string
  mx_found: boolean
  did_you_mean: string | null
  domain_age_days: string | null
  active_in_days: string | null
  smtp_provider: string | null
  mx_record: string | null
  firstname: string | null
  lastname: string | null
  gender: string | null
  country: string | null
  region: string | null
  city: string | null
  zipcode: string | null
  processed_at: string
}

/**
 * Validates an email address using the ZeroBounce API
 *
 * This function checks if an email is deliverable and safe to use by querying
 * the ZeroBounce validation service. It handles various email statuses including
 * invalid addresses, spam traps, and abusive accounts.
 *
 * @param email - The email address to validate
 * @returns An object containing validation result and response data, or null
 *   - Object with `{ valid: boolean, data: EmailValidationResponse }` when validation succeeds
 *   - `null` if validation couldn't be performed (API key missing or error occurred)
 *          This allows for graceful degradation when email validation is unavailable
 *
 * @example
 * const result = await validateEmail("user@example.com");
 * if (result === null) {
 *   // Validation service unavailable
 * } else if (result.valid) {
 *   // Email is valid
 * } else {
 *   // Email is invalid
 * }
 */
export async function validateEmail(
  email: string
): Promise<{ valid: boolean; data: EmailValidationResponse } | null> {
  if (!process.env.ZEROBOUNCE_API_KEY) {
    return null
  }

  try {
    const response = await fetch(
      `https://api.zerobounce.net/v2/validate?api_key=${process.env.ZEROBOUNCE_API_KEY}&email=${email}&ip_address=`
    )

    const responseData = (await response.json()) as unknown

    // Convert the mx_found string value to a boolean if it's 'true' or 'false'
    // Otherwise keep the original value (could be null or another value)
    const data = {
      ...(responseData as Record<string, unknown>),
      mx_found:
        (responseData as Record<string, unknown>).mx_found === 'true'
          ? true
          : (responseData as Record<string, unknown>).mx_found === 'false'
            ? false
            : (responseData as Record<string, unknown>).mx_found,
    } as EmailValidationResponse

    switch (data.status) {
      case 'invalid':
      case 'spamtrap':
      case 'abuse':
      case 'do_not_mail':
        return { valid: false, data }
      default:
        return { valid: true, data }
    }
  } catch (error) {
    l.error({
      key: 'validate_email:error',
      error: serializeError(error),
      context: {
        email,
      },
    })
    return null
  }
}

export const shouldWarnAboutAlternateEmail = async (
  validationResult: EmailValidationResponse
): Promise<boolean> => {
  // Always warn about alternate emails since we removed KV storage
  return validationResult.sub_status === 'alternate'
}
