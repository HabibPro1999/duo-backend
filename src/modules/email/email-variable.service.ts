// =============================================================================
// EMAIL VARIABLE SERVICE
// Builds context from Registration data and resolves variables in templates
// =============================================================================

import { prisma } from '@/database/client.js'
import type { Prisma } from '@/generated/prisma/client.js'
import type { EmailContext, VariableDefinition } from './email.types.js'

// Type for registration with all needed relations
type RegistrationWithRelations = Prisma.RegistrationGetPayload<{
  include: {
    event: {
      include: { client: true }
    }
    form: true
  }
}>

// =============================================================================
// VARIABLE DEFINITIONS (For editor variable picker)
// =============================================================================

export const BASE_VARIABLES: VariableDefinition[] = [
  // Registration
  { id: 'firstName', label: 'First Name', category: 'registration', description: 'Registrant first name', example: 'John' },
  { id: 'lastName', label: 'Last Name', category: 'registration', description: 'Registrant last name', example: 'Doe' },
  { id: 'fullName', label: 'Full Name', category: 'registration', description: 'First and last name combined', example: 'John Doe' },
  { id: 'email', label: 'Email', category: 'registration', description: 'Registrant email address', example: 'john@example.com' },
  { id: 'phone', label: 'Phone', category: 'registration', description: 'Registrant phone number', example: '+216 12 345 678' },
  { id: 'registrationDate', label: 'Registration Date', category: 'registration', description: 'Date of registration', example: 'March 15, 2025' },

  // Event
  { id: 'eventName', label: 'Event Name', category: 'event', description: 'Name of the event', example: 'Medical Conference 2025' },
  { id: 'eventDate', label: 'Event Date', category: 'event', description: 'Start date of event', example: 'April 20, 2025' },
  { id: 'eventEndDate', label: 'Event End Date', category: 'event', description: 'End date of event', example: 'April 22, 2025' },
  { id: 'eventLocation', label: 'Event Location', category: 'event', description: 'Event venue/location', example: 'Tunis, Tunisia' },

  // Payment
  { id: 'totalAmount', label: 'Total Amount', category: 'payment', description: 'Total registration cost', example: '250 TND' },
  { id: 'paidAmount', label: 'Paid Amount', category: 'payment', description: 'Amount already paid', example: '250 TND' },
  { id: 'amountDue', label: 'Amount Due', category: 'payment', description: 'Remaining amount to pay', example: '0 TND' },
  { id: 'paymentStatus', label: 'Payment Status', category: 'payment', description: 'Current payment status', example: 'Confirmed' },

  // Access
  { id: 'selectedAccess', label: 'Selected Access', category: 'access', description: 'All selected workshops, dinners, etc.', example: 'Workshop A, Gala Dinner' },

  // Links
  { id: 'registrationLink', label: 'Registration Link', category: 'links', description: 'Link to view registration', example: 'https://...' },
  { id: 'editRegistrationLink', label: 'Edit Registration Link', category: 'links', description: 'Link to edit registration', example: 'https://...' },
  { id: 'paymentLink', label: 'Payment Link', category: 'links', description: 'Link to payment page', example: 'https://...' },

  // Organization
  { id: 'organizerName', label: 'Organizer Name', category: 'event', description: 'Name of organizing company', example: 'Medical Events Co.' },
  { id: 'organizerEmail', label: 'Organizer Email', category: 'event', description: 'Contact email', example: 'contact@events.com' },
  { id: 'organizerPhone', label: 'Organizer Phone', category: 'event', description: 'Contact phone', example: '+216 71 123 456' },

  // Bank Details
  { id: 'bankName', label: 'Bank Name', category: 'bank', description: 'Name of the bank', example: 'Banque de Tunisie' },
  { id: 'bankAccountName', label: 'Account Holder', category: 'bank', description: 'Name on the bank account', example: 'Medical Events SARL' },
  { id: 'bankAccountNumber', label: 'Account Number', category: 'bank', description: 'Bank account number/IBAN', example: 'TN59 1234 5678 9012 3456 7890' }
]

// =============================================================================
// GET AVAILABLE VARIABLES (includes dynamic form fields)
// =============================================================================

export async function getAvailableVariables(eventId: string): Promise<VariableDefinition[]> {
  const variables = [...BASE_VARIABLES]

  // Get form schema to extract field-based variables
  const form = await prisma.form.findFirst({
    where: { eventId, type: 'REGISTRATION' },
    select: { schema: true }
  })

  if (form?.schema) {
    const schema = form.schema as { steps?: Array<{ fields?: Array<{ id: string; label?: string; type: string }> }> }

    if (schema.steps) {
      for (const step of schema.steps) {
        for (const field of step.fields || []) {
          // Skip non-data fields
          if (['heading', 'paragraph', 'divider'].includes(field.type)) continue

          variables.push({
            id: `form_${field.id}`,
            label: field.label || field.id,
            category: 'form',
            description: `Form field: ${field.label || field.id}`,
            example: getExampleForFieldType(field.type)
          })
        }
      }
    }
  }

  return variables
}

function getExampleForFieldType(type: string): string {
  const examples: Record<string, string> = {
    text: 'Sample text',
    email: 'user@example.com',
    phone: '+216 12 345 678',
    number: '42',
    date: 'March 15, 2025',
    dropdown: 'Option A',
    radio: 'Selected option',
    checkbox: 'Yes',
    textarea: 'Long text content...',
    file: '[Uploaded file]'
  }
  return examples[type] || 'Value'
}

// =============================================================================
// BUILD EMAIL CONTEXT FROM REGISTRATION
// =============================================================================

export function buildEmailContext(registration: RegistrationWithRelations): EmailContext {
  const formData = (registration.formData as Record<string, unknown>) || {}
  const baseUrl = process.env.PUBLIC_FORMS_URL || 'https://events.example.com'

  // Build base context
  const context: EmailContext = {
    // Registration
    firstName: registration.firstName || String(formData.firstName || ''),
    lastName: registration.lastName || String(formData.lastName || ''),
    fullName: [registration.firstName, registration.lastName].filter(Boolean).join(' ') || 'Registrant',
    email: registration.email,
    phone: registration.phone || String(formData.phone || ''),
    registrationDate: formatDate(registration.submittedAt),
    registrationId: registration.id,
    registrationNumber: registration.id.slice(0, 8).toUpperCase(),

    // Event
    eventName: registration.event.name,
    eventDate: formatDate(registration.event.startDate),
    eventEndDate: formatDate(registration.event.endDate),
    eventLocation: registration.event.location || '',
    eventDescription: registration.event.description || '',

    // Payment
    totalAmount: formatCurrency(registration.totalAmount, registration.currency),
    paidAmount: formatCurrency(registration.paidAmount, registration.currency),
    amountDue: formatCurrency(registration.totalAmount - (registration.sponsorshipAmount || 0) - registration.paidAmount, registration.currency),
    paymentStatus: formatPaymentStatus(registration.paymentStatus),
    paymentMethod: registration.paymentMethod || '',

    // Access (will be enriched below)
    selectedAccess: '',
    selectedWorkshops: '',
    selectedDinners: '',

    // Links (uses registration ID as token placeholder - implement proper tokens later)
    registrationLink: `${baseUrl}/registration/${registration.id}/${registration.id}`,
    editRegistrationLink: `${baseUrl}/registration/${registration.id}/${registration.id}`,
    paymentLink: `${baseUrl}/payment/${registration.id}/${registration.id}`,

    // Organization
    organizerName: registration.event.client.name,
    organizerEmail: registration.event.client.email || '',
    organizerPhone: registration.event.client.phone || '',

    // Bank Details (populated in buildEmailContextWithAccess)
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: ''
  }

  // Add dynamic form fields
  for (const [key, value] of Object.entries(formData)) {
    context[`form_${key}` as keyof EmailContext] = formatFieldValue(value)
  }

  return context
}

// Build context with access type names resolved
export async function buildEmailContextWithAccess(
  registration: RegistrationWithRelations
): Promise<EmailContext> {
  const context = buildEmailContext(registration)

  // Fetch pricing for bank details
  const pricing = await prisma.eventPricing.findUnique({
    where: { eventId: registration.eventId },
    select: { bankName: true, bankAccountName: true, bankAccountNumber: true }
  })

  if (pricing) {
    context.bankName = pricing.bankName || ''
    context.bankAccountName = pricing.bankAccountName || ''
    context.bankAccountNumber = pricing.bankAccountNumber || ''
  }

  // Resolve access type IDs to names
  if (registration.accessTypeIds && registration.accessTypeIds.length > 0) {
    const accessTypes = await prisma.eventAccess.findMany({
      where: { id: { in: registration.accessTypeIds } },
      select: { id: true, name: true, type: true }
    })

    const accessMap = new Map(accessTypes.map(a => [a.id, a]))
    const selectedNames = registration.accessTypeIds
      .map(id => accessMap.get(id)?.name)
      .filter(Boolean) as string[]

    context.selectedAccess = selectedNames.join(', ')

    // Filter by type
    context.selectedWorkshops = accessTypes
      .filter(a => a.type === 'WORKSHOP')
      .map(a => a.name)
      .join(', ')

    context.selectedDinners = accessTypes
      .filter(a => a.type === 'DINNER')
      .map(a => a.name)
      .join(', ')
  }

  return context
}

// =============================================================================
// RESOLVE VARIABLES IN TEMPLATE
// =============================================================================

export function resolveVariables(template: string, context: EmailContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, varId) => {
    const value = context[varId as keyof EmailContext]

    if (value !== undefined && value !== null && value !== '') {
      return sanitizeForHtml(String(value))
    }

    // Return empty string for undefined variables
    return ''
  })
}

// =============================================================================
// XSS SANITIZATION
// =============================================================================

export function sanitizeForHtml(value: unknown): string {
  if (value === null || value === undefined) return ''

  const str = String(value)

  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase()

  // Block dangerous protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return '#blocked'
  }

  return url
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatCurrency(amount: number, currency = 'TND'): string {
  return `${amount.toLocaleString()} ${currency}`
}

function formatPaymentStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'PENDING': 'Pending',
    'PAID': 'Confirmed',
    'REFUNDED': 'Refunded',
    'WAIVED': 'Waived'
  }
  return statusMap[status] || status
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  if (value instanceof Date) return formatDate(value)
  return String(value)
}

// =============================================================================
// SAMPLE DATA FOR PREVIEW
// =============================================================================

export function getSampleEmailContext(): EmailContext {
  return {
    firstName: 'John',
    lastName: 'Doe',
    fullName: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+216 12 345 678',
    registrationDate: 'March 15, 2025',
    registrationId: 'abc123',
    registrationNumber: 'ABC123',

    eventName: 'Medical Conference 2025',
    eventDate: 'April 20, 2025',
    eventEndDate: 'April 22, 2025',
    eventLocation: 'Tunis, Tunisia',
    eventDescription: 'Annual medical conference',

    totalAmount: '250 TND',
    paidAmount: '250 TND',
    amountDue: '0 TND',
    paymentStatus: 'Confirmed',
    paymentMethod: 'Bank Transfer',

    selectedAccess: 'Workshop A, Gala Dinner',
    selectedWorkshops: 'Workshop A',
    selectedDinners: 'Gala Dinner',

    registrationLink: 'https://events.example.com/registration/abc123/abc123',
    editRegistrationLink: 'https://events.example.com/registration/abc123/abc123',
    paymentLink: 'https://events.example.com/payment/abc123/abc123',

    organizerName: 'Medical Events Co.',
    organizerEmail: 'contact@medicalevents.com',
    organizerPhone: '+216 71 123 456',

    bankName: 'Banque de Tunisie',
    bankAccountName: 'Medical Events SARL',
    bankAccountNumber: 'TN59 1234 5678 9012 3456 7890'
  }
}
