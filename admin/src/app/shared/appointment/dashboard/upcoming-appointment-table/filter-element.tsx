'use client';

import StatusField from '@/components/controlled-table/status-field';
import { Badge, Text, Button } from 'rizzui';
import { PiCheckCircleBold, PiClockBold, PiTrashDuotone } from 'react-icons/pi';
import { appointmentTypes } from '@/data/appointment-data';

const appointmentTypesOptions = Object.entries(appointmentTypes).map(
  ([value, label]) => ({ label, value })
);

const statusOptions = [
  {
    value: 'scheduled',
    label: 'Scheduled',
  },
  {
    value: 'waiting',
    label: 'Waiting',
  },
];

type FilterElementProps = {
  isFiltered: boolean;
  filters: { [key: string]: any };
  updateFilter: (columnId: string, filterValue: string | any[]) => void;
  handleReset: () => void;
};
export default function FilterElement({
  isFiltered,
  filters,
  updateFilter,
  handleReset,
}: FilterElementProps) {
  return (
    <div className="flex w-full flex-col items-center gap-3 @[22rem]:flex-row @[35rem]:w-auto @[57rem]:-ms-4">
      <StatusField
        dropdownClassName="!z-10"
        className="w-full min-w-[170px] @[35rem]:w-auto"
        placeholder="Select type"
        options={appointmentTypesOptions}
        value={filters['type']}
        onChange={(value: string) => {
          updateFilter('type', value);
        }}
        getOptionValue={(option: { value: any }) => option.value}
        displayValue={(selected: string) =>
          appointmentTypesOptions.find((option) => option.label === selected)
            ?.label ?? ''
        }
        placement="bottom-start"
      />
      <StatusField
        dropdownClassName="!z-10"
        className="w-full @[35rem]:w-auto"
        options={statusOptions}
        value={filters['status']}
        onChange={(value: string) => {
          updateFilter('status', value);
        }}
        getOptionValue={(option: { value: any }) => option.value}
      />
      {isFiltered ? (
        <Button
          size="sm"
          onClick={() => {
            handleReset();
          }}
          className="h-8 bg-gray-200/70"
          variant="flat"
        >
          <PiTrashDuotone className="me-1.5 h-[17px] w-[17px]" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
