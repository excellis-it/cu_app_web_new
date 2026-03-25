'use client';
import { useEffect, useRef, useState } from 'react';
import { PiXBold } from 'react-icons/pi';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import {
  Input,
  Button,
  ActionIcon,
  Title,
  Password,
} from 'rizzui';
import { useModal } from '@/app/shared/modal-views/use-modal';
import callApi from '@/helpers/callApi';
import toast from 'react-hot-toast';
import FormGroup from '@/app/shared/form-group';
import UploadZone from '@/components/file-upload/upload-zone';
import useApi from '@/hooks/useApi';
import {
  EditUserInput,
} from '@/utils/validators/edit-user.schema';
import { io, Socket } from 'socket.io-client';

export default function EditUser({
  refresh = () => {},
  id,
  getAllUserFn,
}: {
  refresh: Function;
  id: string;
  getAllUserFn: Function;
}) {
  const { closeModal } = useModal();
  const [reset, setReset] = useState({});
  const [isLoading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const { formState, setError } = useForm<EditUserInput>();
  const socketRef = useRef<Socket | null>(null); // Moved inside the component body
    useEffect(() => {

      // Initialize the socket connection
      socketRef.current = io(process.env.NEXT_PUBLIC_SOCKET_URL as string);
    }, []);

  const {
    data: { data: initialValues },
    refresh: refreshGroup,
  } = useApi(`/api/admin/users/get-single-user?id=${id}`, {}, 'GET');

  const onSubmit: SubmitHandler<EditUserInput> = async (data: any) => {
    const formData = new FormData();

    formData.append('_id', initialValues._id);
    if (selectedImage && typeof selectedImage !== 'string') {
      formData.append('file', selectedImage);
    }
    formData.append('name', data.name);
    formData.append('email', data.email);
    if (data.newPassword) {
      formData.append('password', data.newPassword);
    }
    formData.append('phone', data.phone ? data.phone : '0000000000');
    formData.append('userType', data.userType);
    formData.append('accountStatus', data.accountStatus);

    setLoading(true);
    try {
      let { data, success } = await callApi(
        '/api/admin/users/update-user-details',
        formData,
        'POST',
        { 'content-type': 'multipart/form-data' }
      );
      if (data.success) {
        toast.success('User Updated successfully');
        refresh();
        if (socketRef.current) {
          socketRef.current.emit('user_upadate');
        } else {
          console.error('Socket is not initialized');
        }
        getAllUserFn();
        closeModal();
      } else {
        if (data?.error?.code > 10000) {
          setError(data.error.field, {
            type: 'manual',
            message: data.error.message,
          });
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    }
    setLoading(false);
  };

  return (
    <>
      {initialValues?._id && (
        <Form<EditUserInput>
          resetValues={reset}
          onSubmit={onSubmit}
          useFormProps={{
            defaultValues: initialValues,
          }}
          className="grid grid-cols-1 gap-6 p-6 @container md:grid-cols-2 [&_.rizzui-input-label]:font-medium [&_.rizzui-input-label]:text-gray-900"
        >
          {({ register, getValues, setValue, formState: { errors } }) => {
            return (
              <>
                <div className="col-span-full flex items-center justify-between">
                  <Title as="h4" className="font-semibold">
                    Edit User
                  </Title>
                  <ActionIcon size="sm" variant="text" onClick={closeModal}>
                    <PiXBold className="h-auto w-5" />
                  </ActionIcon>
                </div>
                <Input
                  label="User Name"
                  placeholder="Enter Name"
                  {...register('name')}
                  className="col-span-full"
                  error={errors.name?.message || formState.errors.name?.message}
                />
                <Input
                  label="Email"
                  placeholder="Enter Email"
                  {...register('email')}
                  className="col-span-full"
                  error={errors.name?.message || formState.errors.name?.message}
                />
                
                <Password
                  label="Password"
                  placeholder="Enter Password"
                  {...register('newPassword')}
                  className="col-span-full"
                  error={errors.name?.message || formState.errors.name?.message}
                />

                <label>Status</label>
                <select
                  {...register('accountStatus')}
                  className="col-span-full"
                  // className="rizzui-select-label mb-1.5 block text-sm font-medium"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <label>User type</label>
                <select {...register('userType')} className="col-span-full">
                  <option value="admin">Admin</option>
                  <option value="user">Member</option>
                </select>

                <FormGroup
                  title="Image"
                  description="Add Image here"
                  className="col-span-full pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
                >
                  <div className="mb-5 @3xl:col-span-2">
                    <UploadZone
                      name="image"
                      getValues={getValues}
                      setValue={setValue}
                      onChange={(file: File) => setSelectedImage(file)}
                    />
                  </div>
                </FormGroup>
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
                    Update User Details
                  </Button>
                </div>
              </>
            );
          }}
        </Form>
      )}
    </>
  );
}
