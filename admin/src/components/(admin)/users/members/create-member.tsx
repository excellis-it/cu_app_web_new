'use client';

import { useEffect, useState } from 'react';
import { PiXBold } from 'react-icons/pi';
import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { Input, Button, ActionIcon, Title, Select } from 'rizzui';
import {
  CreateUserInput,
  createUserSchema,
} from '@/utils/validators/create-user.schema';
import { useModal } from '@/app/shared/modal-views/use-modal';
import {
  permissions,
  roles,
  statuses,
} from '@/app/shared/roles-permissions/utils';
import callApi from '@/helpers/callApi';
import toast from 'react-hot-toast';
import Swal from 'sweetalert2';
import { User } from '@/data/users-data';
import { FormError } from '@/helpers/Types';
import { PhoneNumber } from '@/components/ui/phone-input';
export default function CreateMember({
  refresh = () => {},
}: {
  refresh: Function;
}) {
  const { closeModal } = useModal();
  const [reset, setReset] = useState({});
  const [isLoading, setLoading] = useState(false);
  const { formState, setError } = useForm<CreateUserInput>();
  const onSubmit: SubmitHandler<CreateUserInput> = async (data) => {
    const formattedData = {
      ...data,
      userType: 'user',
    };
    setLoading(true);
    try {
      let chekUser = await callApi(
        `/api/admin/users/get-user-by-mail?email=${formattedData.email}`,
        {},
        'GET'
      );
      console.log('chekUser', chekUser.data.data);
      let result: any = null;
      if (chekUser?.data?.data) {
        closeModal()
        // If the user exists, show the SweetAlert confirmation
         result = await Swal.fire({
          title: 'User already registerd!',
          text: 'This user is already registerd.  Do you want to add your member list?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, create user',
          cancelButtonText: 'No, cancel',
          confirmButtonColor: "#3085d6",
          cancelButtonColor: "#d33",
          customClass: {
            popup: 'z-index-999999', // Ensures it is above the modal
          },
          backdrop: `
            rgba(0,0,0,0.4)
            left top 
            no-repeat
          `,
         
        });
        if (result.isConfirmed) {
          await Swal.fire({
            title: " Member Added!",
            text: "your member has been added successfully",
            icon: "success",
            customClass: {
              popup: 'z-index-999999', // Ensures it is above the modal
            },
            backdrop: `
              rgba(0,0,0,0.4)
              left top
              no-repeat
            `,
          });
            setLoading(false); // Stop loading if user cancels

          
              let { data, success } = await callApi(
              '/api/admin/users/create-user',
              formattedData,
              'POST'
              );
              if (success) {
                toast.success('User created successfully');
                setReset({
                  fullName: '',
                  email: '',
                  role: '',
                  permissions: '',
                  status: '',
                });
                refresh();
                closeModal();
              } else {
                if (data.error.code > 10000) {
                  setError(data.error.field, {
                    type: 'manual',
                    message: data.error.message,
                  });
                }
              }
        }
      
          return; // Exit the function

        
      }      
      else{
        let { data, success } = await callApi(
          '/api/admin/users/create-user',
          formattedData,
          'POST'
        );
        console.log('data', data);
        if (success) {
          toast.success('User created successfully');
          setReset({
            fullName: '',
            email: '',
            role: '',
            permissions: '',
            status: '',
          });
          refresh();
          closeModal();
        } else {
          if (data.error.code > 10000) {
            setError(data.error.field, {
              type: 'manual',
              message: data.error.message,
            });
          }
        }
      }

      
    } catch (error: any) {
      toast.error(error.message);
    }
    setLoading(false);
  };

  // const handleSetError = (error: FormError, setError: Function) => {
  //   setError(error.field, {
  //     type: 'manual',
  //     message: error.message,
  //   });
  // }

  return (
    <Form<CreateUserInput>
      resetValues={reset}
      onSubmit={onSubmit}
      validationSchema={createUserSchema}
      className="grid grid-cols-1 gap-6 p-6 @container md:grid-cols-2 [&_.rizzui-input-label]:font-medium [&_.rizzui-input-label]:text-gray-900"
    >
      {({ register, setError, control, watch, formState: { errors } }) => {
        return (
          <>
            <div className="col-span-full flex items-center justify-between">
              <Title as="h4" className="font-semibold">
                Add a new User
              </Title>
              <ActionIcon size="sm" variant="text" onClick={closeModal}>
                <PiXBold className="h-auto w-5" />
              </ActionIcon>
            </div>
            <Input
              label="Full Name"
              placeholder="Enter user's full name"
              {...register('name')}
              className="col-span-full"
              error={errors.name?.message || formState.errors.name?.message}
            />

            <Input
              label="Email"
              placeholder="Enter user's Email Address"
              className="col-span-full"
              {...register('email')}
              error={errors.email?.message || formState.errors.email?.message}
            />
            <Input
              label="Password"
              placeholder="Enter user's Password"
              className="col-span-full"
              {...register('password')}
              error={
                errors.password?.message || formState.errors.password?.message
              }
            />
            {/* <Controller
              name="phone"
              control={control}
              render={({ field: { value, onChange } }) => (
                <PhoneNumber
                  label="Enter user's Phone Number"
                  country="us"
                  value={value}
                  onChange={onChange}
                  error={errors.phone?.message || formState.errors.phone?.message}
                />
              )}
            /> */}
            <Controller
              name="status"
              control={control}
              render={({ field: { name, onChange, value } }) => (
                <Select
                  options={statuses}
                  value={value}
                  onChange={onChange}
                  name={name}
                  label="Status"
                  error={
                    errors?.status?.message || formState.errors.status?.message
                  }
                  getOptionValue={(option) => option.value}
                  displayValue={(selected: string) =>
                    statuses.find((option) => option.value === selected)
                      ?.label ?? ''
                  }
                  dropdownClassName="!z-[1]"
                  inPortal={false}
                />
              )}
            />

            <div className="col-span-full flex items-center justify-end gap-4">
              <Button
                variant="outline"
                onClick={closeModal}
                className="w-full @xl:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={isLoading}
                className="w-full @xl:w-auto"
              >
                Create User
              </Button>
            </div>
          </>
        );
      }}
    </Form>
  );
}
