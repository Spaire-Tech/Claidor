import { twMerge } from 'tailwind-merge'

const LabeledRadioButton = (props: {
  values: string[]
  value: string
  onSelected: (value: string) => void
}) => {
  const vals = props.values.map((v) => {
    return {
      label: v,
      selected: v === props.value,
    }
  })

  return (
    <div className=" flex flex-row rounded-lg bg-gray-100 text-sm text-gray-500">
      {vals.map((v) => {
        return (
          <div
            key={v.label}
            onClick={() => props.onSelected(v.label)}
            className={twMerge(
              v.selected
                ? ' rounded-lg bg-gray-50 text-gray-900 shadow-sm'
                : '',
              'cursor-pointer rounded-lg px-2.5 py-1.5',
            )}
          >
            {v.label}
          </div>
        )
      })}
    </div>
  )
}

export default LabeledRadioButton
