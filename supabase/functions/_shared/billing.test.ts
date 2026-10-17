import { describe, expect, it } from 'vitest'
import {
  checkoutBody,
  cycleFromAsaas,
  parseWebhook,
  pixSubscriptionBody,
  planValue,
  validCpfCnpj,
  safeEqual,
  saoPauloDate,
} from './billing'

describe('saoPauloDate', () => {
  it('usa a data civil de Brasília, não a de UTC', () => {
    expect(saoPauloDate(new Date('2026-10-18T01:30:00Z'))).toBe('2026-10-17')
    expect(saoPauloDate(new Date('2026-10-18T03:00:00Z'))).toBe('2026-10-18')
  })
})

describe('planValue', () => {
  const plan = { name: 'Até 30', monthly_price_brl: 49.9, yearly_price_brl: 499, max_subjects: 30 }
  it('escolhe o preço do ciclo', () => {
    expect(planValue(plan, 'monthly')).toBe(49.9)
    expect(planValue(plan, 'yearly')).toBe(499)
  })
  it('recusa plano sem preço', () => {
    expect(planValue({ ...plan, yearly_price_brl: null }, 'yearly')).toBeNull()
  })
})

describe('checkoutBody', () => {
  const body = checkoutBody({
    orgId: '11111111-1111-1111-1111-111111111111',
    planName: 'Ilimitado',
    cycle: 'yearly',
    value: 899,
    today: '2026-10-17',
    appUrl: 'https://avalixfit.com.br/',
    imageBase64: 'AAAA',
  })

  it('checkout recorrente só com cartão (o Asaas recusa Pix em RECURRENT), começando hoje', () => {
    expect(body.billingTypes).toEqual(['CREDIT_CARD'])
    expect(body.chargeTypes).toEqual(['RECURRENT'])
    expect(body.subscription).toEqual({ cycle: 'YEARLY', nextDueDate: '2026-10-17' })
  })

  it('leva o org_id como referência e volta para a tela do plano', () => {
    expect(body.externalReference).toBe('11111111-1111-1111-1111-111111111111')
    expect(body.callback.successUrl).toBe('https://avalixfit.com.br/configuracoes/plano?retorno=ok')
    expect(body.callback.cancelUrl).toBe('https://avalixfit.com.br/configuracoes/plano?retorno=cancelado')
  })

  it('respeita os limites de texto do Asaas', () => {
    expect(body.items[0].name.length).toBeLessThanOrEqual(30)
    expect(body.items[0]).toMatchObject({ name: 'Avalix Ilimitado', quantity: 1, value: 899 })
  })
})

describe('pixSubscriptionBody', () => {
  it('assinatura Pix com o org_id como referência e a primeira fatura hoje', () => {
    expect(
      pixSubscriptionBody({
        customerId: 'cus_1',
        orgId: 'org-1',
        planName: 'Até 30',
        cycle: 'monthly',
        value: 19.9,
        today: '2026-10-17',
      })
    ).toEqual({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 19.9,
      nextDueDate: '2026-10-17',
      cycle: 'MONTHLY',
      description: 'Avalix Até 30 (mensal)',
      externalReference: 'org-1',
    })
  })
})

describe('validCpfCnpj', () => {
  it('aceita CPF e CNPJ com dígitos verificadores certos, com ou sem máscara', () => {
    expect(validCpfCnpj('529.982.247-25')).toBe(true)
    expect(validCpfCnpj('52998224725')).toBe(true)
    expect(validCpfCnpj('11.222.333/0001-81')).toBe(true)
  })
  it('recusa dígito errado, repetição e tamanho errado', () => {
    expect(validCpfCnpj('529.982.247-24')).toBe(false)
    expect(validCpfCnpj('111.111.111-11')).toBe(false)
    expect(validCpfCnpj('11.222.333/0001-80')).toBe(false)
    expect(validCpfCnpj('1234')).toBe(false)
  })
})

describe('safeEqual', () => {
  it('compara o token inteiro', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true)
    expect(safeEqual('abc123', 'abc124')).toBe(false)
    expect(safeEqual('abc', 'abc123')).toBe(false)
    expect(safeEqual('', 'x')).toBe(false)
  })
})

describe('cycleFromAsaas', () => {
  it('só conhece mensal e anual', () => {
    expect(cycleFromAsaas('MONTHLY')).toBe('monthly')
    expect(cycleFromAsaas('YEARLY')).toBe('yearly')
    expect(cycleFromAsaas('WEEKLY')).toBeNull()
  })
})

describe('parseWebhook', () => {
  it('lê evento de pagamento de assinatura sem levar dados do pagador', () => {
    const event = parseWebhook({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_1',
        subscription: 'sub_1',
        customer: 'cus_1',
        status: 'RECEIVED',
        billingType: 'PIX',
        dueDate: '2026-10-17',
        invoiceUrl: 'https://www.asaas.com/i/pay_1',
        externalReference: 'org',
        creditCard: { creditCardNumber: '1234' },
        name: 'Fulano',
      },
    })
    expect(event).toEqual({
      eventId: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      subscriptionId: 'sub_1',
      externalReference: 'org',
      payment: {
        id: 'pay_1',
        status: 'RECEIVED',
        billingType: 'PIX',
        dueDate: '2026-10-17',
        invoiceUrl: 'https://www.asaas.com/i/pay_1',
        customer: 'cus_1',
      },
    })
  })

  it('descarta link de fatura que não é https', () => {
    const event = parseWebhook({
      id: 'evt_2',
      event: 'PAYMENT_CREATED',
      payment: { id: 'pay_2', invoiceUrl: 'javascript:alert(1)' },
    })
    expect(event?.payment?.invoiceUrl).toBeNull()
  })

  it('lê evento de assinatura', () => {
    expect(
      parseWebhook({ id: 'evt_3', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_9' } })
    ).toMatchObject({ subscriptionId: 'sub_9', payment: null })
  })

  it('recusa corpo sem id ou sem evento', () => {
    expect(parseWebhook(null)).toBeNull()
    expect(parseWebhook({ event: 'PAYMENT_CREATED' })).toBeNull()
    expect(parseWebhook({ id: 'x' })).toBeNull()
  })
})
