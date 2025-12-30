/**
 * Comprehensive Seed Script for DUO Platform
 *
 * Creates a complete test dataset including:
 * - Client organization
 * - Event with full configuration
 * - Form with all 12 field types and conditional logic
 * - Pricing rules with various conditions
 * - Access items (workshops, dinners, sessions, etc.) with prerequisites
 *
 * Run with: bun run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ============================================================================
// HELPERS
// ============================================================================

function uuid(): string {
  return randomUUID();
}

function futureDate(daysFromNow: number, hours = 0, minutes = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// ============================================================================
// SEED DATA
// ============================================================================

async function main() {
  console.log('🌱 Starting comprehensive seed...\n');

  // --------------------------------------------------------------------------
  // 0. CLEANUP EXISTING DATA
  // --------------------------------------------------------------------------
  console.log('🧹 Cleaning up existing seed data...');

  // Delete in order of dependencies (children first)
  await prisma.registration.deleteMany({});
  await prisma.eventAccess.deleteMany({});
  await prisma.eventPricing.deleteMany({});
  await prisma.form.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.user.deleteMany({ where: { role: { not: 0 } } }); // Keep super admins

  console.log('   ✓ Cleanup complete\n');

  // --------------------------------------------------------------------------
  // 1. CLIENT
  // --------------------------------------------------------------------------
  console.log('📦 Creating client...');

  const client = await prisma.client.create({
    data: {
      id: uuid(),
      name: 'Société Tunisienne de Cardiologie',
      logo: 'https://example.com/logo.png',
      primaryColor: '#1E40AF',
      email: 'contact@stc-tunisie.tn',
      phone: '+216 71 123 456',
      active: true,
    },
  });

  console.log(`   ✓ Client: ${client.name}`);

  // --------------------------------------------------------------------------
  // 2. EVENT
  // --------------------------------------------------------------------------
  console.log('📅 Creating event...');

  const event = await prisma.event.create({
    data: {
      id: uuid(),
      clientId: client.id,
      name: 'Congrès National de Cardiologie 2025',
      slug: 'congres-cardio-2025',
      description:
        "Le plus grand congrès de cardiologie en Tunisie. Rejoignez plus de 500 professionnels de santé pour 3 jours de conférences, ateliers et networking.",
      maxCapacity: 500,
      registeredCount: 0,
      startDate: futureDate(60, 8, 0), // 60 days from now, 8:00 AM
      endDate: futureDate(62, 18, 0), // 62 days from now, 6:00 PM
      location: 'Hôtel Laico Tunis, Tunis',
      status: 'OPEN',
    },
  });

  console.log(`   ✓ Event: ${event.name}`);

  // --------------------------------------------------------------------------
  // 3. FORM WITH ALL FIELD TYPES
  // --------------------------------------------------------------------------
  console.log('📝 Creating form with all field types...');

  const formSchema = {
    steps: [
      // ========== STEP 1: Personal Information ==========
      {
        id: 'step_personal',
        title: 'Informations personnelles',
        description: 'Tous les champs marqués * sont obligatoires',
        fields: [
          // HEADING - Display only
          {
            id: 'heading_welcome',
            type: 'heading',
            label: '',
            required: false,
            width: 'full',
            headingSize: 'h2',
            content: 'Bienvenue au formulaire d\'inscription',
          },
          // PARAGRAPH - Display only
          {
            id: 'paragraph_intro',
            type: 'paragraph',
            label: '',
            required: false,
            width: 'full',
            content:
              'Merci de remplir ce formulaire avec attention. Vos informations seront utilisées pour votre badge et les communications.',
          },
          // TEXT - First name
          {
            id: 'text_prenom',
            type: 'text',
            label: 'Prénom',
            placeholder: 'Votre prénom',
            required: true,
            width: 'half',
            helperText: "Tel qu'il apparaît sur votre pièce d'identité",
            defaultValue: '',
            validation: {
              minLength: 2,
              maxLength: 50,
              errorMessages: {
                required: 'Le prénom est obligatoire',
                minLength: 'Le prénom doit contenir au moins 2 caractères',
              },
            },
          },
          // TEXT - Last name
          {
            id: 'text_nom',
            type: 'text',
            label: 'Nom',
            placeholder: 'Votre nom',
            required: true,
            width: 'half',
            validation: {
              minLength: 2,
              maxLength: 50,
              pattern: '^[a-zA-ZÀ-ÿ\\s-]+$',
              errorMessages: {
                pattern: 'Le nom ne peut contenir que des lettres',
              },
            },
          },
          // EMAIL
          {
            id: 'email_contact',
            type: 'email',
            label: 'Email',
            placeholder: 'votre.email@exemple.com',
            required: true,
            width: 'full',
            helperText: 'Nous utiliserons cet email pour vous envoyer la confirmation',
            validation: {
              errorMessages: {
                required: "L'email est obligatoire",
                email: 'Veuillez entrer un email valide',
              },
            },
          },
          // PHONE
          {
            id: 'phone_contact',
            type: 'phone',
            label: 'Téléphone',
            placeholder: '+216 XX XXX XXX',
            required: true,
            width: 'half',
            phoneFormat: 'TN',
          },
          // DATE - Birth date
          {
            id: 'birthDate',
            type: 'date',
            label: 'Date de naissance',
            required: false,
            width: 'half',
            dateFormat: 'dd/MM/yyyy',
            validation: {
              minDate: '1940-01-01',
              maxDate: '2006-01-01',
            },
          },
        ],
      },
      // ========== STEP 2: Professional Information ==========
      {
        id: 'step_professional',
        title: 'Informations professionnelles',
        description: 'Parlez-nous de votre parcours',
        fields: [
          // DROPDOWN - Specialty (with price impact via pricing rules)
          {
            id: 'specialty',
            type: 'dropdown',
            label: 'Spécialité',
            placeholder: 'Sélectionnez votre spécialité',
            required: true,
            width: 'full',
            searchable: true,
            options: [
              {
                id: 'cardiology',
                value: 'cardiology',
                label: 'Cardiologie',
                description: 'Spécialiste du cœur et du système cardiovasculaire',
              },
              {
                id: 'neurology',
                value: 'neurology',
                label: 'Neurologie',
                description: 'Spécialiste du système nerveux',
              },
              {
                id: 'pediatrics',
                value: 'pediatrics',
                label: 'Pédiatrie',
                description: 'Médecine des enfants',
              },
              {
                id: 'general',
                value: 'general',
                label: 'Médecine générale',
                description: 'Médecin généraliste',
              },
              {
                id: 'other',
                value: 'other',
                label: 'Autre',
                description: 'Autre spécialité non listée',
              },
            ],
          },
          // TEXT - Other specialty (conditional)
          {
            id: 'otherSpecialty',
            type: 'text',
            label: 'Précisez votre spécialité',
            placeholder: 'Votre spécialité...',
            required: true,
            width: 'full',
            conditions: [
              {
                id: 'cond_other_specialty',
                fieldId: 'specialty',
                operator: 'equals',
                value: 'other',
              },
            ],
            conditionLogic: 'and',
            conditionAction: 'show',
            clearOnHide: true,
          },
          // RADIO - Attendee type (affects pricing)
          {
            id: 'attendeeType',
            type: 'radio',
            label: 'Type de participant',
            required: true,
            width: 'full',
            layout: 'cards',
            options: [
              {
                id: 'doctor',
                value: 'doctor',
                label: 'Médecin',
                description: 'Médecin en exercice',
              },
              {
                id: 'resident',
                value: 'resident',
                label: 'Résident',
                description: 'Médecin en formation',
              },
              {
                id: 'student',
                value: 'student',
                label: 'Étudiant',
                description: 'Étudiant en médecine',
              },
              {
                id: 'nurse',
                value: 'nurse',
                label: 'Infirmier(ère)',
                description: 'Personnel infirmier',
              },
              {
                id: 'industry',
                value: 'industry',
                label: 'Industrie',
                description: "Représentant de l'industrie pharmaceutique",
              },
            ],
          },
          // NUMBER - Years of experience
          {
            id: 'yearsExperience',
            type: 'number',
            label: "Nombre d'années d'expérience",
            placeholder: '0',
            required: false,
            width: 'half',
            defaultValue: 0,
            validation: {
              minValue: 0,
              maxValue: 50,
              step: 1,
              errorMessages: {
                min: 'La valeur minimale est 0',
                max: 'La valeur maximale est 50',
              },
            },
          },
          // DROPDOWN - Country (affects pricing and access)
          {
            id: 'country',
            type: 'dropdown',
            label: 'Pays',
            placeholder: 'Sélectionnez votre pays',
            required: true,
            width: 'half',
            searchable: true,
            options: [
              { id: 'TN', value: 'TN', label: 'Tunisie' },
              { id: 'DZ', value: 'DZ', label: 'Algérie' },
              { id: 'MA', value: 'MA', label: 'Maroc' },
              { id: 'LY', value: 'LY', label: 'Libye' },
              { id: 'FR', value: 'FR', label: 'France' },
              { id: 'OTHER', value: 'OTHER', label: 'Autre' },
            ],
          },
          // TEXT - Institution
          {
            id: 'institution',
            type: 'text',
            label: 'Établissement / Hôpital',
            placeholder: "Nom de votre établissement",
            required: true,
            width: 'full',
          },
          // TEXTAREA - Address
          {
            id: 'address',
            type: 'textarea',
            label: 'Adresse professionnelle',
            placeholder: 'Rue, ville, code postal...',
            required: false,
            width: 'full',
            rows: 3,
            validation: {
              maxLength: 500,
            },
          },
        ],
      },
      // ========== STEP 3: Participation Details ==========
      {
        id: 'step_participation',
        title: 'Détails de participation',
        description: 'Personnalisez votre expérience',
        fields: [
          // CHECKBOX - Interests (multiple selection)
          {
            id: 'interests',
            type: 'checkbox',
            label: 'Domaines d\'intérêt',
            required: false,
            width: 'full',
            layout: 'vertical',
            options: [
              {
                id: 'interventional',
                value: 'interventional',
                label: 'Cardiologie interventionnelle',
                description: 'Cathétérisme, angioplastie, stenting',
              },
              {
                id: 'imaging',
                value: 'imaging',
                label: 'Imagerie cardiaque',
                description: 'Échocardiographie, IRM, scanner',
              },
              {
                id: 'electrophysiology',
                value: 'electrophysiology',
                label: 'Électrophysiologie',
                description: 'Arythmies, pacemakers, défibrillateurs',
              },
              {
                id: 'prevention',
                value: 'prevention',
                label: 'Prévention cardiovasculaire',
                description: 'Facteurs de risque, hygiène de vie',
              },
              {
                id: 'heart_failure',
                value: 'heart_failure',
                label: 'Insuffisance cardiaque',
                description: 'Diagnostic et traitement',
              },
            ],
            validation: {
              minSelections: 0,
              maxSelections: 3,
              errorMessages: {
                max: 'Vous pouvez sélectionner au maximum 3 domaines',
              },
            },
          },
          // RADIO - Dietary requirements
          {
            id: 'dietary',
            type: 'radio',
            label: 'Régime alimentaire',
            required: true,
            width: 'full',
            layout: 'horizontal',
            options: [
              { id: 'none', value: 'none', label: 'Aucune restriction' },
              { id: 'vegetarian', value: 'vegetarian', label: 'Végétarien' },
              { id: 'vegan', value: 'vegan', label: 'Végan' },
              { id: 'halal', value: 'halal', label: 'Halal' },
              { id: 'other_diet', value: 'other_diet', label: 'Autre' },
            ],
          },
          // TEXT - Other dietary (conditional)
          {
            id: 'otherDietary',
            type: 'text',
            label: 'Précisez vos restrictions alimentaires',
            placeholder: 'Allergies, intolérances...',
            required: true,
            width: 'full',
            conditions: [
              {
                id: 'cond_other_diet',
                fieldId: 'dietary',
                operator: 'equals',
                value: 'other_diet',
              },
            ],
            conditionLogic: 'and',
            conditionAction: 'show',
            clearOnHide: true,
          },
          // FILE - CV (conditional on presenter)
          {
            id: 'cv',
            type: 'file',
            label: 'CV (pour les présentateurs)',
            required: false,
            width: 'full',
            helperText: 'PDF uniquement, max 5 Mo',
            validation: {
              acceptedFileTypes: ['.pdf'],
              maxFileSize: 5242880,
            },
          },
          // FILE - Photo
          {
            id: 'photo',
            type: 'file',
            label: "Photo d'identité",
            required: true,
            width: 'half',
            helperText: 'JPG ou PNG, max 2 Mo. Sera utilisée pour votre badge.',
            validation: {
              acceptedFileTypes: ['.jpg', '.jpeg', '.png'],
              maxFileSize: 2097152,
            },
          },
          // TEXTAREA - Special needs
          {
            id: 'specialNeeds',
            type: 'textarea',
            label: 'Besoins spéciaux ou remarques',
            placeholder: 'Accessibilité, assistance particulière...',
            required: false,
            width: 'full',
            rows: 4,
            validation: {
              maxLength: 1000,
            },
          },
        ],
      },
    ],
  };

  const form = await prisma.form.create({
    data: {
      id: uuid(),
      eventId: event.id,
      name: "Formulaire d'inscription - Congrès Cardiologie 2025",
      schema: formSchema,
      schemaVersion: 1,
      successTitle: 'Inscription réussie !',
      successMessage:
        'Merci pour votre inscription. Un email de confirmation vous sera envoyé dans les prochaines minutes.',
    },
  });

  console.log(`   ✓ Form: ${form.name}`);
  console.log(`     - ${formSchema.steps.length} steps`);
  console.log(
    `     - ${formSchema.steps.reduce((acc, s) => acc + s.fields.length, 0)} fields total`
  );

  // --------------------------------------------------------------------------
  // 4. PRICING WITH CONDITIONAL RULES
  // --------------------------------------------------------------------------
  console.log('💰 Creating pricing rules...');

  const pricing = await prisma.eventPricing.create({
    data: {
      id: uuid(),
      eventId: event.id,
      basePrice: 300, // 300 TND (base price for doctors)
      currency: 'TND',
      rules: [
        // Rule 1: Students get 70% discount (highest priority)
        {
          id: uuid(),
          name: 'Tarif Étudiant',
          description: 'Réduction de 70% pour les étudiants en médecine',
          priority: 100,
          conditions: [{ fieldId: 'attendeeType', operator: 'equals', value: 'student' }],
          conditionLogic: 'AND',
          price: 90, // 90 TND
          active: true,
        },
        // Rule 2: Residents get 50% discount
        {
          id: uuid(),
          name: 'Tarif Résident',
          description: 'Réduction de 50% pour les résidents',
          priority: 90,
          conditions: [{ fieldId: 'attendeeType', operator: 'equals', value: 'resident' }],
          conditionLogic: 'AND',
          price: 150, // 150 TND
          active: true,
        },
        // Rule 3: Nurses get 40% discount
        {
          id: uuid(),
          name: 'Tarif Infirmier',
          description: 'Réduction de 40% pour le personnel infirmier',
          priority: 80,
          conditions: [{ fieldId: 'attendeeType', operator: 'equals', value: 'nurse' }],
          conditionLogic: 'AND',
          price: 180, // 180 TND
          active: true,
        },
        // Rule 4: Industry pays premium
        {
          id: uuid(),
          name: 'Tarif Industrie',
          description: "Tarif pour les représentants de l'industrie",
          priority: 70,
          conditions: [{ fieldId: 'attendeeType', operator: 'equals', value: 'industry' }],
          conditionLogic: 'AND',
          price: 500, // 500 TND
          active: true,
        },
        // Rule 5: International attendees (non-Maghreb) get special rate
        {
          id: uuid(),
          name: 'Tarif International',
          description: 'Tarif pour les participants internationaux (hors Maghreb)',
          priority: 60,
          conditions: [
            { fieldId: 'country', operator: 'not_in', value: ['TN', 'DZ', 'MA', 'LY'] },
            { fieldId: 'attendeeType', operator: 'equals', value: 'doctor' },
          ],
          conditionLogic: 'AND',
          price: 250, // 250 TND (discount for international doctors)
          active: true,
        },
        // Rule 6: Cardiologists from Tunisia get member rate
        {
          id: uuid(),
          name: 'Tarif Membre STC',
          description: 'Tarif préférentiel pour les cardiologues tunisiens membres de la STC',
          priority: 50,
          conditions: [
            { fieldId: 'specialty', operator: 'equals', value: 'cardiology' },
            { fieldId: 'country', operator: 'equals', value: 'TN' },
            { fieldId: 'attendeeType', operator: 'equals', value: 'doctor' },
          ],
          conditionLogic: 'AND',
          price: 250, // 250 TND
          active: true,
        },
      ],
      onlinePaymentEnabled: true,
      onlinePaymentUrl: 'https://payment.stc-tunisie.tn/pay',
      bankName: 'Banque Internationale Arabe de Tunisie (BIAT)',
      bankAccountName: 'Société Tunisienne de Cardiologie',
      bankAccountNumber: 'TN59 0800 1000 0001 2345 6789',
    },
  });

  console.log(`   ✓ Pricing: Base ${pricing.basePrice} TND`);
  console.log(`     - ${(pricing.rules as unknown[]).length} conditional rules`);

  // --------------------------------------------------------------------------
  // 5. ACCESS ITEMS (Workshops, Dinners, Sessions, etc.)
  // --------------------------------------------------------------------------
  console.log('🎫 Creating access items...');

  // Day 1 Sessions (Morning - same time = radio selection)
  const session1A = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'SESSION',
      name: 'Keynote: Avancées en Cardiologie Interventionnelle',
      description: 'Présentation des dernières innovations en cathétérisme cardiaque',
      location: 'Amphithéâtre Principal',
      startsAt: futureDate(60, 9, 0), // Day 1, 9:00
      endsAt: futureDate(60, 10, 30),
      price: 0, // Free with registration
      maxCapacity: 300,
      sortOrder: 1,
      active: true,
    },
  });

  const session1B = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'SESSION',
      name: 'Keynote: Intelligence Artificielle en Cardiologie',
      description: "L'IA au service du diagnostic cardiaque",
      location: 'Salle A',
      startsAt: futureDate(60, 9, 0), // Same time as 1A = conflict
      endsAt: futureDate(60, 10, 30),
      price: 0,
      maxCapacity: 150,
      sortOrder: 2,
      active: true,
    },
  });

  // Day 1 Workshops (Afternoon - multiple time slots)
  const workshop1 = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'WORKSHOP',
      name: 'Atelier: Échocardiographie Avancée',
      description: 'Techniques avancées et cas pratiques',
      location: 'Salle de Formation 1',
      startsAt: futureDate(60, 14, 0), // Day 1, 14:00
      endsAt: futureDate(60, 16, 0),
      price: 50, // 50 TND
      maxCapacity: 30,
      sortOrder: 1,
      active: true,
      // Only for doctors and residents (not students)
      conditions: [{ fieldId: 'attendeeType', operator: 'in', value: ['doctor', 'resident'] }],
      conditionLogic: 'AND',
    },
  });

  const workshop2 = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'WORKSHOP',
      name: 'Atelier: ECG Interprétation',
      description: "De la base à l'expertise",
      location: 'Salle de Formation 2',
      startsAt: futureDate(60, 14, 0), // Same time as workshop1 = conflict
      endsAt: futureDate(60, 16, 0),
      price: 30, // 30 TND
      maxCapacity: 40,
      sortOrder: 2,
      active: true,
    },
  });

  const workshop3 = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'WORKSHOP',
      name: 'Atelier: Simulation de Réanimation Cardiaque',
      description: 'Pratique sur mannequin haute-fidélité',
      location: 'Salle de Simulation',
      startsAt: futureDate(60, 16, 30), // Day 1, 16:30 (different slot)
      endsAt: futureDate(60, 18, 30),
      price: 75, // 75 TND
      maxCapacity: 20,
      sortOrder: 3,
      active: true,
    },
  });

  // Day 1 Dinner (Evening)
  const galaDinner = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'DINNER',
      name: 'Dîner de Gala',
      description: 'Soirée de gala avec remise des prix',
      location: 'Restaurant Panoramique',
      startsAt: futureDate(60, 20, 0), // Day 1, 20:00
      endsAt: futureDate(60, 23, 0),
      price: 150, // 150 TND
      maxCapacity: 200,
      sortOrder: 1,
      active: true,
      // Not available for students
      conditions: [{ fieldId: 'attendeeType', operator: 'not_equals', value: 'student' }],
      conditionLogic: 'AND',
    },
  });

  // Day 2 Sessions
  const session2A = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'SESSION',
      name: 'Table Ronde: Insuffisance Cardiaque',
      description: 'Discussion avec les experts',
      location: 'Amphithéâtre Principal',
      startsAt: futureDate(61, 9, 0), // Day 2, 9:00
      endsAt: futureDate(61, 11, 0),
      price: 0,
      maxCapacity: 300,
      sortOrder: 1,
      active: true,
    },
  });

  // Networking
  const networking = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'NETWORKING',
      name: 'Happy Hour Networking',
      description: 'Cocktail et échanges entre participants',
      location: 'Terrasse Panoramique',
      startsAt: futureDate(61, 18, 0), // Day 2, 18:00
      endsAt: futureDate(61, 20, 0),
      price: 0, // Free
      maxCapacity: null, // Unlimited
      sortOrder: 1,
      active: true,
    },
  });

  // Transport - Only for international attendees
  const airportPickup = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'TRANSPORT',
      name: 'Navette Aéroport',
      description: "Service de navette depuis l'aéroport Tunis-Carthage",
      location: 'Aéroport Tunis-Carthage',
      startsAt: futureDate(59, 10, 0), // Day before event
      endsAt: futureDate(59, 22, 0),
      price: 30, // 30 TND
      maxCapacity: 50,
      sortOrder: 1,
      active: true,
      conditions: [{ fieldId: 'country', operator: 'not_equals', value: 'TN' }],
      conditionLogic: 'AND',
    },
  });

  // Accommodation - Only for non-Tunisian
  const hotelSingle = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'ACCOMMODATION',
      name: 'Chambre Simple - Hôtel Laico',
      description: '3 nuits, petit-déjeuner inclus',
      location: 'Hôtel Laico Tunis',
      price: 450, // 450 TND
      maxCapacity: 50,
      sortOrder: 1,
      active: true,
      conditions: [{ fieldId: 'country', operator: 'not_equals', value: 'TN' }],
      conditionLogic: 'AND',
    },
  });

  const hotelDouble = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'ACCOMMODATION',
      name: 'Chambre Double - Hôtel Laico',
      description: '3 nuits, petit-déjeuner inclus, vue mer',
      location: 'Hôtel Laico Tunis',
      price: 600, // 600 TND
      maxCapacity: 30,
      sortOrder: 2,
      active: true,
      conditions: [{ fieldId: 'country', operator: 'not_equals', value: 'TN' }],
      conditionLogic: 'AND',
    },
  });

  // Other - Lunch packages
  const lunchPackage = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'OTHER',
      name: 'Forfait Déjeuners (3 jours)',
      description: 'Déjeuners buffet les 3 jours du congrès',
      groupLabel: 'Restauration',
      location: 'Restaurant Principal',
      price: 90, // 90 TND
      maxCapacity: 400,
      sortOrder: 1,
      active: true,
    },
  });

  // Other - Certificate with prerequisite
  const certificate = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'OTHER',
      name: 'Certificat de Participation Officiel',
      description: 'Certificat signé avec crédits de formation continue',
      groupLabel: 'Certificats',
      price: 20, // 20 TND
      maxCapacity: null,
      sortOrder: 2,
      active: true,
      // Only for doctors
      conditions: [
        { fieldId: 'attendeeType', operator: 'in', value: ['doctor', 'resident'] },
      ],
      conditionLogic: 'AND',
    },
  });

  // Workshop certificate - requires attending at least one workshop
  const workshopCertificate = await prisma.eventAccess.create({
    data: {
      id: uuid(),
      eventId: event.id,
      type: 'OTHER',
      name: 'Certificat Atelier',
      description: "Certificat spécifique pour l'atelier suivi",
      groupLabel: 'Certificats',
      price: 15, // 15 TND
      maxCapacity: null,
      sortOrder: 3,
      active: true,
    },
  });

  // Set prerequisites (workshop certificate requires a workshop)
  await prisma.eventAccess.update({
    where: { id: workshopCertificate.id },
    data: {
      requiredAccess: {
        connect: [{ id: workshop1.id }, { id: workshop2.id }, { id: workshop3.id }],
      },
    },
  });

  console.log('   ✓ Access items created:');
  console.log('     - 2 Sessions (same time slot = radio selection)');
  console.log('     - 3 Workshops (2 same time + 1 different)');
  console.log('     - 1 Gala Dinner (not for students)');
  console.log('     - 1 Networking event (free)');
  console.log('     - 1 Airport transport (international only)');
  console.log('     - 2 Accommodation options (international only)');
  console.log('     - 3 Other items (meals, certificates)');
  console.log('     - 1 Prerequisite relationship (workshop → certificate)');

  // --------------------------------------------------------------------------
  // 6. SAMPLE REGISTRATIONS
  // --------------------------------------------------------------------------
  console.log('📋 Creating sample registrations...');

  const sampleRegistrations = [
    {
      email: 'ahmed.benali@email.com',
      firstName: 'Ahmed',
      lastName: 'Ben Ali',
      phone: '+216 98 123 456',
      paymentStatus: 'PAID' as const,
      paymentMethod: 'BANK_TRANSFER' as const,
      totalAmount: 590, // 300 base + 50 workshop + 150 gala + 90 lunch
      paidAmount: 590,
      formData: {
        text_prenom: 'Ahmed',
        text_nom: 'Ben Ali',
        email_contact: 'ahmed.benali@email.com',
        phone_contact: '+216 98 123 456',
        date_birth: '1985-03-15',
        specialty: 'cardio_interventionnelle',
        attendeeType: 'doctor',
        country: 'TN',
        institution: 'CHU Tunis',
        dietary: 'none',
        interests: ['echocardiography', 'heart_failure'],
      },
    },
    {
      email: 'fatima.mansouri@hospital.tn',
      firstName: 'Fatima',
      lastName: 'Mansouri',
      phone: '+216 55 789 012',
      paymentStatus: 'PAID' as const,
      paymentMethod: 'ONLINE' as const,
      totalAmount: 280, // 250 base + 0 session + 30 workshop
      paidAmount: 280,
      formData: {
        text_prenom: 'Fatima',
        text_nom: 'Mansouri',
        email_contact: 'fatima.mansouri@hospital.tn',
        phone_contact: '+216 55 789 012',
        date_birth: '1978-07-22',
        specialty: 'cardiology',
        attendeeType: 'doctor',
        country: 'TN',
        institution: 'Hôpital Charles Nicolle',
        dietary: 'vegetarian',
        interests: ['prevention', 'imaging'],
      },
    },
    {
      email: 'karim.trabelsi@gmail.com',
      firstName: 'Karim',
      lastName: 'Trabelsi',
      phone: '+216 22 456 789',
      paymentStatus: 'PAID' as const,
      paymentMethod: 'CASH' as const,
      totalAmount: 240, // 150 base + 90 lunch
      paidAmount: 240,
      formData: {
        text_prenom: 'Karim',
        text_nom: 'Trabelsi',
        email_contact: 'karim.trabelsi@gmail.com',
        phone_contact: '+216 22 456 789',
        date_birth: '1992-11-08',
        specialty: 'general_medicine',
        attendeeType: 'resident',
        country: 'TN',
        institution: 'CHU Sfax',
        dietary: 'none',
        interests: ['echocardiography', 'arrhythmia'],
      },
    },
    {
      email: 'leila.bouazizi@med.tn',
      firstName: 'Leila',
      lastName: 'Bouazizi',
      phone: '+216 50 111 222',
      paymentStatus: 'PENDING' as const,
      totalAmount: 300, // 300 TND
      paidAmount: 0,
      formData: {
        text_prenom: 'Leila',
        text_nom: 'Bouazizi',
        email_contact: 'leila.bouazizi@med.tn',
        phone_contact: '+216 50 111 222',
        date_birth: '1980-05-30',
        specialty: 'pediatric_cardiology',
        attendeeType: 'doctor',
        country: 'TN',
        institution: 'Hôpital d\'Enfants Tunis',
        dietary: 'halal',
        interests: ['heart_failure', 'prevention'],
      },
    },
    {
      email: 'mohamed.gharbi@student.tn',
      firstName: 'Mohamed',
      lastName: 'Gharbi',
      phone: '+216 99 333 444',
      paymentStatus: 'PENDING' as const,
      totalAmount: 90, // 90 TND (student)
      paidAmount: 0,
      formData: {
        text_prenom: 'Mohamed',
        text_nom: 'Gharbi',
        email_contact: 'mohamed.gharbi@student.tn',
        phone_contact: '+216 99 333 444',
        date_birth: '1999-01-12',
        specialty: 'other',
        otherSpecialty: 'Médecine 5ème année',
        attendeeType: 'student',
        country: 'TN',
        institution: 'Faculté de Médecine de Tunis',
        dietary: 'none',
        interests: ['imaging', 'echocardiography'],
      },
    },
    {
      email: 'jean.dupont@aphp.fr',
      firstName: 'Jean',
      lastName: 'Dupont',
      phone: '+33 6 12 34 56 78',
      paymentStatus: 'WAIVED' as const,
      totalAmount: 630, // 0 base (waived) + 450 hotel + 30 airport + 150 gala
      paidAmount: 0,
      formData: {
        text_prenom: 'Jean',
        text_nom: 'Dupont',
        email_contact: 'jean.dupont@aphp.fr',
        phone_contact: '+33 6 12 34 56 78',
        date_birth: '1970-09-18',
        specialty: 'cardio_interventionnelle',
        attendeeType: 'doctor',
        country: 'FR',
        institution: 'AP-HP Paris',
        dietary: 'none',
        interests: ['intervention', 'arrhythmia'],
      },
    },
    {
      email: 'sarah.nejjar@um5.ac.ma',
      firstName: 'Sarah',
      lastName: 'Nejjar',
      phone: '+212 6 61 23 45 67',
      paymentStatus: 'REFUNDED' as const,
      totalAmount: 250, // 250 TND
      paidAmount: 0,
      formData: {
        text_prenom: 'Sarah',
        text_nom: 'Nejjar',
        email_contact: 'sarah.nejjar@um5.ac.ma',
        phone_contact: '+212 6 61 23 45 67',
        date_birth: '1988-04-25',
        specialty: 'cardiology',
        attendeeType: 'doctor',
        country: 'MA',
        institution: 'CHU Ibn Sina Rabat',
        dietary: 'vegetarian',
        interests: ['prevention', 'imaging'],
      },
    },
    {
      email: 'youssef.hadj@infirmier.tn',
      firstName: 'Youssef',
      lastName: 'Hadj',
      phone: '+216 25 987 654',
      paymentStatus: 'PAID' as const,
      paymentMethod: 'BANK_TRANSFER' as const,
      totalAmount: 180, // 180 TND (nurse)
      paidAmount: 180,
      formData: {
        text_prenom: 'Youssef',
        text_nom: 'Hadj',
        email_contact: 'youssef.hadj@infirmier.tn',
        phone_contact: '+216 25 987 654',
        date_birth: '1995-12-03',
        specialty: 'other',
        otherSpecialty: 'Infirmier spécialisé cardiologie',
        attendeeType: 'nurse',
        country: 'TN',
        institution: 'Clinique El Manar',
        dietary: 'none',
        interests: ['heart_failure', 'echocardiography'],
      },
    },
  ];

  // Define access selections per registration
  type AccessSelection = { accessId: string; name: string; unitPrice: number; quantity: number; subtotal: number };
  const accessSelectionsMap: Record<string, AccessSelection[]> = {
    'ahmed.benali@email.com': [
      { accessId: workshop1.id, name: 'Atelier: Échocardiographie Avancée', unitPrice: 50, quantity: 1, subtotal: 50 },
      { accessId: galaDinner.id, name: 'Dîner de Gala', unitPrice: 150, quantity: 1, subtotal: 150 },
      { accessId: lunchPackage.id, name: 'Forfait Déjeuners (3 jours)', unitPrice: 90, quantity: 1, subtotal: 90 },
    ],
    'fatima.mansouri@hospital.tn': [
      { accessId: session1A.id, name: 'Keynote: Avancées en Cardiologie Interventionnelle', unitPrice: 0, quantity: 1, subtotal: 0 },
      { accessId: workshop2.id, name: 'Atelier: ECG Interprétation', unitPrice: 30, quantity: 1, subtotal: 30 },
    ],
    'jean.dupont@aphp.fr': [
      { accessId: hotelSingle.id, name: 'Chambre Simple - Hôtel Laico', unitPrice: 450, quantity: 1, subtotal: 450 },
      { accessId: airportPickup.id, name: 'Navette Aéroport', unitPrice: 30, quantity: 1, subtotal: 30 },
      { accessId: galaDinner.id, name: 'Dîner de Gala', unitPrice: 150, quantity: 1, subtotal: 150 },
    ],
    'karim.trabelsi@gmail.com': [
      { accessId: lunchPackage.id, name: 'Forfait Déjeuners (3 jours)', unitPrice: 90, quantity: 1, subtotal: 90 },
    ],
  };

  // Create registrations with access selections in accessTypeIds and priceBreakdown
  for (const reg of sampleRegistrations) {
    const accessSelections = accessSelectionsMap[reg.email] ?? [];
    const accessTotal = accessSelections.reduce((sum, a) => sum + a.subtotal, 0);

    await prisma.registration.create({
      data: {
        id: uuid(),
        formId: form.id,
        eventId: event.id,
        email: reg.email,
        firstName: reg.firstName,
        lastName: reg.lastName,
        phone: reg.phone,
        paymentStatus: reg.paymentStatus,
        paymentMethod: 'paymentMethod' in reg ? reg.paymentMethod : null,
        totalAmount: reg.totalAmount,
        paidAmount: reg.paidAmount,
        baseAmount: reg.totalAmount - accessTotal,
        accessAmount: accessTotal,
        formData: reg.formData,
        accessTypeIds: accessSelections.map(a => a.accessId),
        priceBreakdown: {
          basePrice: reg.totalAmount - accessTotal,
          appliedRules: [],
          calculatedBasePrice: reg.totalAmount - accessTotal,
          accessItems: accessSelections,
          accessTotal,
          subtotal: reg.totalAmount,
          sponsorships: [],
          sponsorshipTotal: 0,
          total: reg.totalAmount,
          currency: 'TND',
        },
        submittedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date in last 7 days
        paidAt: reg.paymentStatus === 'PAID' || reg.paymentStatus === 'WAIVED'
          ? new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000)
          : null,
      },
    });
  }

  // Update event registeredCount
  await prisma.event.update({
    where: { id: event.id },
    data: { registeredCount: sampleRegistrations.length },
  });

  console.log(`   ✓ Created ${sampleRegistrations.length} sample registrations`);

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n✅ Seed completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   • Client: ${client.name}`);
  console.log(`   • Event: ${event.name} (${event.slug})`);
  console.log(`   • Form: ${formSchema.steps.length} steps, all 12 field types`);
  console.log(`   • Pricing: ${pricing.basePrice} TND base + 6 conditional rules`);
  console.log(`   • Access: 14 items across 7 types`);
  console.log(`   • Registrations: ${sampleRegistrations.length} sample participants`);
  console.log('\n🔗 Test URLs:');
  console.log(`   • Registration: /api/forms/public/${event.slug}`);
  console.log(`   • Columns: /api/events/${event.id}/registrations/columns`);
  console.log(`   • Access: /api/public/events/${event.id}/access/grouped`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
