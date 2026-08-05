'use client'

import CustomFieldTypeIcon from '@/components/CustomFields/CustomFieldTypeIcon'
import { toast } from '@/components/Toast/use-toast'
import { useCreateCustomField, useCustomFields } from '@/hooks/queries'
import ClearOutlined from '@mui/icons-material/ClearOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { List, ListItem } from '@spaire/ui/components/atoms/List'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import Switch from '@spaire/ui/components/atoms/Switch'
import {
  FormControl,
  FormField,
  FormLabel,
} from '@spaire/ui/components/ui/form'
import { useMemo, useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'
import type { FormBuilderValues } from './FormBuilder'

// Friendly field kinds shown in the builder. Each maps onto an existing
// custom-field type under the hood — Phone/Text are text fields, Multiple
// choice/Dropdown are selects, Checkbox is a checkbox. (Phone and a dedicated
// radio render are a follow-up once those land as first-class types.)
type FieldKind = 'phone' | 'text' | 'multiple_choice' | 'dropdown' | 'checkbox'

const FIELD_KINDS: {
  key: FieldKind
  label: string
  customType: schemas['CustomField']['type']
  hasOptions: boolean
}[] = [
  { key: 'phone', label: 'Phone', customType: 'text', hasOptions: false },
  { key: 'text', label: 'Text', customType: 'text', hasOptions: false },
  {
    key: 'multiple_choice',
    label: 'Multiple choice',
    customType: 'select',
    hasOptions: true,
  },
  {
    key: 'dropdown',
    label: 'Dropdown',
    customType: 'select',
    hasOptions: true,
  },
  {
    key: 'checkbox',
    label: 'Checkbox',
    customType: 'checkbox',
    hasOptions: false,
  },
]

const makeSlug = (name: string) => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `${base || 'field'}-${Math.random().toString(36).slice(2, 7)}`
}

const BasicFieldRow = ({ label }: { label: string }) => (
  <ListItem size="small">
    <div className="flex w-full items-center justify-between text-gray-500">
      <span>{label}</span>
      <LockOutlined fontSize="inherit" />
    </div>
  </ListItem>
)

export interface FormFieldsSectionProps {
  organization: schemas['Organization']
}

export const FormFieldsSection = ({ organization }: FormFieldsSectionProps) => {
  const { control } = useFormContext<FormBuilderValues>()
  const { data: customFields } = useCustomFields(organization.id)
  const createCustomField = useCreateCustomField(organization.id)

  const {
    fields: attachedCustomFields,
    remove,
    append,
  } = useFieldArray({
    control,
    name: 'attached_custom_fields',
  })

  const attachedCustomFieldsMap = useMemo(
    () =>
      attachedCustomFields.reduce<Record<string, schemas['CustomField']>>(
        (acc, field) => {
          const customField = customFields?.items.find(
            ({ id }) => id === field.custom_field_id,
          )
          if (customField) {
            return { ...acc, [field.custom_field_id]: customField }
          }
          return acc
        },
        {},
      ),
    [attachedCustomFields, customFields],
  )

  // Inline "create a field" flow.
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<FieldKind>('text')
  const [label, setLabel] = useState('')
  const [options, setOptions] = useState<string[]>([''])
  const kindDef = FIELD_KINDS.find((k) => k.key === kind) ?? FIELD_KINDS[1]

  const resetAdd = () => {
    setAdding(false)
    setKind('text')
    setLabel('')
    setOptions([''])
  }

  const onCreateField = async () => {
    const name = label.trim()
    if (!name) return

    let properties: Record<string, unknown> = {}
    if (kindDef.hasOptions) {
      const opts = options
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => ({ value: o, label: o }))
      if (opts.length === 0) {
        toast({ title: 'Add at least one option' })
        return
      }
      properties = { options: opts }
    }

    const body = {
      type: kindDef.customType,
      slug: makeSlug(name),
      name,
      organization_id: organization.id,
      properties,
    } as schemas['CustomFieldCreate']

    const { data, error } = await createCustomField.mutateAsync(body)
    if (error || !data) {
      toast({ title: 'Error', description: 'Could not add the field.' })
      return
    }
    append({ custom_field_id: data.id, required: false })
    resetAdd()
  }

  // Attach an existing org custom field.
  const [selectedField, setSelectedField] = useState<string>('')
  const onAttachExisting = () => {
    if (!selectedField) return
    append({ custom_field_id: selectedField, required: false })
    setSelectedField('')
  }
  const availableFields =
    customFields?.items.filter(({ id }) => !attachedCustomFieldsMap[id]) ?? []

  return (
    <div className="flex w-full flex-col gap-4 text-sm">
      <List size="small" className="w-full">
        {/* Basic info fields can't be edited. */}
        <BasicFieldRow label="Name" />
        <BasicFieldRow label="Email" />
        {Object.entries(attachedCustomFieldsMap).map(
          ([customFieldId, customField], index) => (
            <ListItem key={customFieldId} size="small">
              <div className="flex w-full justify-between">
                <div className="flex flex-row items-center gap-2">
                  <CustomFieldTypeIcon type={customField.type} />
                  {customField.name}
                </div>
                <div className="flex flex-row items-center gap-4">
                  <FormField
                    control={control}
                    name={`attached_custom_fields.${index}.required`}
                    render={({ field }) => (
                      <div className="flex flex-row items-center gap-4">
                        <FormLabel
                          className={twMerge(
                            'text-sm',
                            field.value ? '' : 'text-gray-500',
                          )}
                        >
                          Required
                        </FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                    )}
                  />
                  <Button
                    className="border-none bg-transparent text-[16px] opacity-50 transition-opacity hover:opacity-100"
                    size="icon"
                    variant="secondary"
                    type="button"
                    onClick={() => remove(index)}
                  >
                    <ClearOutlined fontSize="inherit" />
                  </Button>
                </div>
              </div>
            </ListItem>
          ),
        )}
      </List>

      {adding ? (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3">
          <Select value={kind} onValueChange={(v) => setKind(v as FieldKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_KINDS.map((k) => (
                <SelectItem key={k.key} value={k.key}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Field label (e.g. Phone number)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          {kindDef.hasOptions ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-500">Options</span>
              {options.map((opt, i) => (
                <div key={i} className="flex flex-row gap-2">
                  <Input
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? e.target.value : o)),
                      )
                    }
                  />
                  {options.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setOptions((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <ClearOutlined fontSize="inherit" />
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOptions((prev) => [...prev, ''])}
              >
                Add option
              </Button>
            </div>
          ) : null}
          <div className="flex flex-row gap-2">
            <Button
              type="button"
              onClick={onCreateField}
              loading={createCustomField.isPending}
              disabled={!label.trim() || createCustomField.isPending}
            >
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={resetAdd}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setAdding(true)}
          >
            Add field
          </Button>
          {availableFields.length > 0 ? (
            <div className="flex flex-row gap-2">
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger>
                  <SelectValue placeholder="Or attach an existing field" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((customField) => (
                    <SelectItem
                      key={customField.id}
                      value={customField.id}
                      textValue={customField.name}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <CustomFieldTypeIcon type={customField.type} />
                        {customField.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={onAttachExisting}
              >
                Attach
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
