'use client';

import { PiTrashDuotone, PiMagnifyingGlassBold } from 'react-icons/pi';
import StatusField from '@/components/controlled-table/status-field';
import { Badge, Text, Title, Button, Input } from 'rizzui';
import { STATUSES } from '@/data/users-data';
import { rolesList } from '@/data/roles-permissions';
import ModalButton from '@/app/shared/modal-button';
import ExportButton from '@/app/shared/export-button';
import CreateMember from '../create-member';

const statusOptions = [
  // {
  //   value: STATUSES.All,
  //   label: "All"
  // },
  {
    value: STATUSES.Active,
    label: STATUSES.Active,
  },
  {
    value: STATUSES.Inactive,
    label: STATUSES.Inactive,
  },
  // {
  //   value: STATUSES.Deleted,
  //   label: STATUSES.Deleted,
  // },
];

type FilterElementProps = {
  data: any[];
  isFiltered: boolean;
  filters: { [key: string]: any };
  updateFilter: (columnId: string, filterValue: string | any[]) => void;
  handleReset: () => void;
  onSearch: (searchTerm: string) => void;
  searchTerm: string;
  refresh: Function;
};

const roles = rolesList.map((role) => ({
  label: role.name,
  value: role.name,
}));

export default function FilterElement({
  data,
  isFiltered,
  handleReset,
  filters,
  updateFilter,
  onSearch,
  searchTerm,
  refresh,
}: FilterElementProps) {
  return (
    <>
      <div className="relative z-50 mb-4 flex flex-wrap items-center justify-between gap-2.5 @container ">
        <Title as="h5" className="-order-6 basis-2/5 @xl:basis-auto">
          All Members
        </Title>

        <StatusField
          className=" -order-3 w-full @[25rem]:w-[calc(calc(100%_-_10px)_/_2)] @4xl:-order-5 @4xl:w-auto"
          options={statusOptions}
          value={filters['accountStatus']}
          onChange={(value: string) => {
            updateFilter('accountStatus', value);
          }}
          placeholder="Filter by Status"
          getOptionValue={(option: { value: any }) => option.value}
          getOptionDisplayValue={(option: { value: any }) =>
            renderOptionDisplayValue(option.value as string)
          }
          displayValue={(selected: string) =>
            renderOptionDisplayValue(selected)
          }
        />
        {/* <StatusField
          className=" -order-3 w-full @[25rem]:w-[calc(calc(100%_-_10px)_/_2)] @4xl:-order-5 @4xl:w-auto"
          options={roles}
          value={filters['userType']}
          onChange={(value: string) => {
            updateFilter('userType', value);
          }}
          placeholder="Filter by User Type"
          getOptionValue={(option: { value: any }) => option.value}
          getOptionDisplayValue={(option: { value: any }) =>
            renderOptionDisplayValue(option.value as string)
          }
          displayValue={(selected: string) =>
            renderOptionDisplayValue(selected)
          }
        /> */}

        {isFiltered && (
          <Button
            size="sm"
            onClick={handleReset}
            className="-order-1 h-8 w-full bg-gray-200/70 @4xl:-order-4 @4xl:w-auto"
            variant="flat"
          >
            <PiTrashDuotone className="me-1.5 h-[17px] w-[17px]" /> Clear
          </Button>
        )}

        <Input
          type="search"
          placeholder="Search for Members..."
          value={searchTerm}
          onClear={() => onSearch('')}
          onChange={(event) => onSearch(event.target.value)}
          prefix={<PiMagnifyingGlassBold className="h-4 w-4" />}
          rounded="lg"
          clearable
          className="-order-4 w-full @xl:-order-5 @xl:ms-auto @xl:w-auto @4xl:-order-2 @4xl:w-[230px] @5xl:w-auto"
        />

        <div className="-order-5 flex basis-auto justify-end @xl:-order-4 @4xl:-order-1">
          <ModalButton
            label="Add New Member"
            view={<CreateMember refresh={refresh} />}
            customSize="600px"
            className="mt-0"
          />
        </div>
        <div className="-order-4 flex basis-auto justify-end @xl:-order-4 @4xl:-order-1">
          {/* <ExportButton
            data={data}
            fileName="product_data"
            header="ID,Name,Category,Product Thumbnail,SKU,Stock,Price,Status,Rating"
          /> */}
        </div>
      </div>
    </>
  );
}

function renderOptionDisplayValue(value: string) {
  switch (value) {
    case STATUSES.Active:
      return (
        <div className="flex items-center">
          <Badge color="success" renderAsDot />
          <Text className="ms-2 font-medium capitalize text-green-dark">
            {value}
          </Text>
        </div>
      );
    case STATUSES.Inactive:
      return (
        <div className="flex items-center">
          <Badge color="danger" renderAsDot />
          <Text className="ms-2 font-medium capitalize text-red-dark">
            {value}
          </Text>
        </div>
      );
    default:
      return (
        <div className="flex items-center">
          <Badge renderAsDot className="bg-gray-400" />
          <Text className="ms-2 font-medium capitalize text-gray-600">
            {value}
          </Text>
        </div>
      );
  }
}
