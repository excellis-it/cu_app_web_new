'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SubmitHandler } from 'react-hook-form';
import { PiArrowRightBold } from 'react-icons/pi';
import { Checkbox, Password, Button, Input, Text } from 'rizzui';
import { Form } from '@/components/ui/form';
import { routes } from '@/config/routes';
import { loginSchema, LoginSchema } from '@/utils/validators/login.schema';
import callApi from '@/helpers/callApi';
import { toast } from 'react-hot-toast';
import { useAuthContext } from '@/context/authContext';
import { useRouter } from 'next/navigation';
import { useAppContext } from '@/context/appContext';

const initialValues: LoginSchema = {
  email: '',
  password: '',
  rememberMe: true,
};

export default function SignInForm() {
  const [reset, setReset] = useState({});
  const { user, setUser, setToken } = useAuthContext();
  const { push } = useRouter();
  const { isLoading } = useAppContext();

  const onSubmit: SubmitHandler<LoginSchema> = async (loginData) => {
    isLoading(true);
    try {
      const { data, success } = await callApi('/api/admin/users/sign-in', {
        id: loginData.email,
        password: loginData.password,
      });
      if (success) {
        toast.success(<Text as="b">{data.message}</Text>);
        const { user, token, userType } = data.data;
        setUser(user);
        setToken(token);
        window.location.reload();
        localStorage.setItem('access-token', token);
        localStorage.setItem('user-type', userType);
        push('/');
      } else {
        toast.error(
          <Text as="b">
            {data.error || data.message || 'Email or password is incorrect'}
          </Text>
        );
      }
    } catch (error) {}
    isLoading(false);
  };

  return (
    <>
      <Form<LoginSchema>
        validationSchema={loginSchema}
        resetValues={reset}
        onSubmit={onSubmit}
        useFormProps={{
          defaultValues: initialValues,
        }}
      >
        {({ register, formState: { errors } }) => (
          <div className="space-y-5">
            <Input
              type="email"
              size="lg"
              label="Email"
              placeholder="Enter your email"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
              {...register('email')}
              error={errors.email?.message}
            />
            <Password
              label="Password"
              placeholder="Enter your password"
              size="lg"
              className="[&>label>span]:font-medium"
              inputClassName="text-sm"
              {...register('password')}
              error={errors.password?.message}
            />
            <div className="flex items-center justify-end pb-2">
              
            </div>
            <Button className="w-full" type="submit" size="lg">
              <span>Sign in</span>{' '}
              <PiArrowRightBold className="ms-2 mt-0.5 h-5 w-5" />
            </Button>
          </div>
        )}
      </Form>
    </>
  );
}
