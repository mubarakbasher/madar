import { Injectable, NotFoundException } from "@nestjs/common";
import { adminPrisma } from "@madar/db";
import { AdminAuditService, type AdminAuditCtx } from "../auth/admin-audit.service";
import { CryptoService } from "../../common/crypto.service";
import type {
  CreateBankAccountInput,
  ListBankAccountsQuery,
  UpdateBankAccountInput,
} from "./dto/bank-account-schemas";

export interface BankAccountResponse {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  country_code: string;
  name_i18n: { en: string };
  notes_i18n: { en: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly audit: AdminAuditService,
    private readonly crypto: CryptoService,
  ) {}

  async list(query: ListBankAccountsQuery): Promise<BankAccountResponse[]> {
    const accounts = await adminPrisma.platformBankAccount.findMany({
      where: query.include_inactive ? {} : { is_active: true },
      orderBy: [{ currency_code: "asc" }, { country_code: "asc" }, { bank_name: "asc" }],
    });
    return accounts.map(toResponse);
  }

  async get(id: string): Promise<BankAccountResponse> {
    const account = await adminPrisma.platformBankAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({ code: "bank_account_not_found", message: "Bank account not found" });
    }
    return toResponse(account);
  }

  async create(input: CreateBankAccountInput, ctx: AdminAuditCtx): Promise<BankAccountResponse> {
    const accountNumberEncrypted = this.crypto.encrypt(input.account_number);
    const accountNumberLast4 = input.account_number.slice(-4);
    const ibanLast4 = input.iban ? input.iban.slice(-4) : null;

    const created = await adminPrisma.platformBankAccount.create({
      data: {
        bank_name: input.bank_name,
        account_holder: input.account_holder,
        account_number_last4: accountNumberLast4,
        account_number_encrypted: accountNumberEncrypted,
        iban_last4: ibanLast4,
        swift: input.swift ?? null,
        currency_code: input.currency_code,
        country_code: input.country_code,
        name_i18n: { en: input.name_en ?? "" },
        notes_i18n: { en: input.notes_en ?? "" },
        is_active: true,
      },
    });

    await this.audit.write(ctx, {
      action: "bank_account.created",
      targetEntity: "platform_bank_account",
      targetId: created.id,
      metadata: {
        bank_name: created.bank_name,
        account_holder: created.account_holder,
        account_number_last4: accountNumberLast4,
        currency_code: created.currency_code,
        country_code: created.country_code,
      },
    });

    return toResponse(created);
  }

  async update(id: string, input: UpdateBankAccountInput, ctx: AdminAuditCtx): Promise<BankAccountResponse> {
    const before = await adminPrisma.platformBankAccount.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "bank_account_not_found", message: "Bank account not found" });
    }

    const data: Record<string, unknown> = {};

    if (input.bank_name !== undefined) data.bank_name = input.bank_name;
    if (input.account_holder !== undefined) data.account_holder = input.account_holder;

    if (input.account_number !== undefined) {
      data.account_number_encrypted = this.crypto.encrypt(input.account_number);
      data.account_number_last4 = input.account_number.slice(-4);
    }

    if (input.iban !== undefined) {
      data.iban_last4 = input.iban ? input.iban.slice(-4) : null;
    }

    if (input.swift !== undefined) data.swift = input.swift ?? null;
    if (input.currency_code !== undefined) data.currency_code = input.currency_code;
    if (input.country_code !== undefined) data.country_code = input.country_code;

    if (input.name_en !== undefined) {
      const prevName = (before.name_i18n ?? {}) as { en?: string };
      data.name_i18n = { en: input.name_en ?? prevName.en ?? "" };
    }

    if (input.notes_en !== undefined) {
      const prevNotes = (before.notes_i18n ?? {}) as { en?: string };
      data.notes_i18n = { en: input.notes_en ?? prevNotes.en ?? "" };
    }

    data.updated_at = new Date();

    const updated = await adminPrisma.platformBankAccount.update({
      where: { id },
      data,
    });

    await this.audit.write(ctx, {
      action: "bank_account.updated",
      targetEntity: "platform_bank_account",
      targetId: updated.id,
      metadata: {
        before: maskForAudit(before),
        after: maskForAudit(updated),
      },
    });

    return toResponse(updated);
  }

  async setActive(id: string, active: boolean, ctx: AdminAuditCtx): Promise<BankAccountResponse> {
    const before = await adminPrisma.platformBankAccount.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException({ code: "bank_account_not_found", message: "Bank account not found" });
    }
    if (before.is_active === active) {
      return this.get(id);
    }

    const updated = await adminPrisma.platformBankAccount.update({
      where: { id },
      data: { is_active: active, updated_at: new Date() },
    });

    await this.audit.write(ctx, {
      action: active ? "bank_account.enabled" : "bank_account.disabled",
      targetEntity: "platform_bank_account",
      targetId: updated.id,
      metadata: { bank_name: updated.bank_name },
    });

    return toResponse(updated);
  }

  async reveal(id: string, ctx: AdminAuditCtx): Promise<{ account_number: string }> {
    const account = await adminPrisma.platformBankAccount.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException({ code: "bank_account_not_found", message: "Bank account not found" });
    }

    const accountNumber = this.crypto.decrypt(account.account_number_encrypted);

    await this.audit.write(ctx, {
      action: "bank_account.revealed",
      targetEntity: "platform_bank_account",
      targetId: account.id,
      metadata: {
        bank_name: account.bank_name,
        account_number_last4: account.account_number_last4,
      },
    });

    return { account_number: accountNumber };
  }
}

type BankAccountRow = {
  id: string;
  bank_name: string;
  account_holder: string;
  account_number_last4: string;
  account_number_encrypted: string;
  iban_last4: string | null;
  swift: string | null;
  currency_code: string;
  country_code: string;
  name_i18n: unknown;
  notes_i18n: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

function toResponse(row: BankAccountRow): BankAccountResponse {
  const name = (row.name_i18n ?? {}) as { en?: string };
  const notes = (row.notes_i18n ?? {}) as { en?: string };
  return {
    id: row.id,
    bank_name: row.bank_name,
    account_holder: row.account_holder,
    account_number_last4: row.account_number_last4,
    iban_last4: row.iban_last4,
    swift: row.swift,
    currency_code: row.currency_code,
    country_code: row.country_code,
    name_i18n: { en: name.en ?? "" },
    notes_i18n: { en: notes.en ?? "" },
    is_active: row.is_active,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function maskForAudit(row: BankAccountRow): Record<string, unknown> {
  return {
    bank_name: row.bank_name,
    account_holder: row.account_holder,
    account_number_last4: row.account_number_last4,
    iban_last4: row.iban_last4,
    swift: row.swift,
    currency_code: row.currency_code,
    country_code: row.country_code,
    is_active: row.is_active,
  };
}
