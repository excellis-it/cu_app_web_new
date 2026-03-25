'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SubmitHandler, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import {
  Input,
  Button,
  Title,
  Text,
  Password,
} from 'rizzui';
import callApi from '@/helpers/callApi';
import toast from 'react-hot-toast';
import FormGroup from '@/app/shared/form-group';
import UploadZone from '@/components/file-upload/upload-zone';
import useApi from '@/hooks/useApi';
import { UserOption } from '@/types';
import {
  EditUserInput,
  editUserSchema,
} from '@/utils/validators/edit-user.schema';
import { useAuthContext } from '@/context/authContext';

export default function EditProfile() {
  const [reset, setReset] = useState({});
  const [isLoading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const { formState, setError } = useForm<EditUserInput>();
  const { checkUser } = useAuthContext();
  const router = useRouter();

  const {
    data: { data: initialValues },
    refresh: refreshGroup,
  } = useApi(`/api/users/get-user`, {}, 'GET');

  const onSubmit: SubmitHandler<EditUserInput> = async (data: any) => {
    const formData = new FormData();

    formData.append('_id', initialValues?.user._id);
    if (selectedImage && typeof selectedImage !== 'string') {
      formData.append('file', selectedImage);
    }
    formData.append('name', data.name);
    formData.append('userName', data.userName);
    formData.append('email', data.email);
    if (data.newPassword) {
      formData.append('password', data.newPassword);
    }
    formData.append('phone', data.phone);

    setLoading(true);
    try {
      let { data } = await callApi(
        '/api/admin/users/update-user-details',
        formData,
        'POST',
        { 'content-type': 'multipart/form-data' }
      );
      if (data.success) {
        toast.success('Profile Updated successfully');
        await checkUser(); // Refresh user data in context
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
      {initialValues?.user?._id && (
        <Form<EditUserInput>
          resetValues={reset}
          onSubmit={onSubmit}
          validationSchema={editUserSchema}
          useFormProps={{
            defaultValues: initialValues?.user,
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
                </div>
                <Input
                  label="Name"
                  placeholder="Enter Name"
                  {...register('name')}
                  className="col-span-full"
                  error={errors.name?.message || formState.errors.name?.message}
                />
                <Input
                  label="Username"
                  placeholder="Enter username"
                  {...register('userName')}
                  className="col-span-full"
                  error={
                    errors.userName?.message ||
                    formState.errors.userName?.message
                  }
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
                  <Button variant="outline" className="w-full @xl:w-auto" onClick={() => router.push('/')}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    className="w-full @xl:w-auto"
                  >
                    Update Profile
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

