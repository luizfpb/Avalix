import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { normalizeDecimalInput } from '@/lib/decimal'

type Props = Omit<ComponentProps<typeof Input>, 'type' | 'inputMode' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
}

// Campo de número com casas decimais (carga, RIR, medidas). Com
// `type="number"`, aceitar a vírgula do teclado brasileiro depende de cada
// navegador, e o Safari do iPhone mudou isso entre versões: em algumas a
// vírgula some e "12,5" vira "125", em outras o campo fica vazio. Aqui o texto
// é do app: o teclado continua numérico e a vírgula vira ponto ao digitar.
export function DecimalInput({ value, onValueChange, ...props }: Props) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => onValueChange(normalizeDecimalInput(event.target.value))}
    />
  )
}
