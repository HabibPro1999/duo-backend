/// <reference types="node" />
/**
 * Migration Script: Update beneficiary name label from "Nom et prénom" to "Nom complet"
 *
 * This script updates all SPONSOR form schemas that have the old label.
 *
 * Run with: npx tsx scripts/update-beneficiary-label.ts
 * Dry run:  npx tsx scripts/update-beneficiary-label.ts --dry-run
 */
import 'dotenv/config';
import { prisma } from '../src/database/client.js';

interface BeneficiaryField {
  id: string;
  type: string;
  label?: string;
  gridColumn?: string;
}

interface BeneficiaryTemplate {
  fields: BeneficiaryField[];
  minCount?: number;
  maxCount?: number;
}

interface SponsorFormSchema {
  formType?: string;
  sponsorSteps?: unknown[];
  beneficiaryTemplate?: BeneficiaryTemplate;
  summarySettings?: unknown;
  sponsorshipSettings?: unknown;
}

const OLD_LABELS = ['Nom et prénom', 'Nom et prenom'];
const NEW_LABEL = 'Nom complet';

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Migration: Update beneficiary name label');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log('='.repeat(60));
  console.log('');

  // Find all SPONSOR forms
  const sponsorForms = await prisma.form.findMany({
    where: { type: 'SPONSOR' },
    select: {
      id: true,
      name: true,
      schema: true,
      event: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  console.log(`Found ${sponsorForms.length} sponsor form(s) to check.\n`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const form of sponsorForms) {
    const schema = form.schema as SponsorFormSchema | null;

    if (!schema?.beneficiaryTemplate?.fields) {
      console.log(`[SKIP] "${form.name}" (${form.id}) - No beneficiary template`);
      skippedCount++;
      continue;
    }

    // Find the name field
    const nameField = schema.beneficiaryTemplate.fields.find(
      (f) => f.id === 'name' && f.type === 'text'
    );

    if (!nameField) {
      console.log(`[SKIP] "${form.name}" (${form.id}) - No name field found`);
      skippedCount++;
      continue;
    }

    // Check if label needs update
    const oldLabel = nameField.label;
    if (!oldLabel || !OLD_LABELS.includes(oldLabel)) {
      console.log(
        `[SKIP] "${form.name}" (${form.id}) - Label already updated or custom: "${oldLabel}"`
      );
      skippedCount++;
      continue;
    }

    // Update the label
    nameField.label = NEW_LABEL;

    if (isDryRun) {
      console.log(
        `[WOULD UPDATE] "${form.name}" (${form.id}) - Event: "${form.event.name}"`
      );
      console.log(`               "${oldLabel}" -> "${NEW_LABEL}"`);
    } else {
      await prisma.form.update({
        where: { id: form.id },
        data: { schema: schema as unknown as Record<string, unknown> },
      });
      console.log(`[UPDATED] "${form.name}" (${form.id}) - Event: "${form.event.name}"`);
      console.log(`          "${oldLabel}" -> "${NEW_LABEL}"`);
    }
    updatedCount++;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Migration Complete');
  console.log('='.repeat(60));
  console.log(`${isDryRun ? 'Would update' : 'Updated'}: ${updatedCount} form(s)`);
  console.log(`Skipped: ${skippedCount} form(s)`);

  if (isDryRun && updatedCount > 0) {
    console.log('\nRun without --dry-run to apply changes.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Migration failed:', error.message);
  await prisma.$disconnect();
  process.exit(1);
});
