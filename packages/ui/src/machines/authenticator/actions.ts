import {
  FetchUserAttributesOutput,
  SignUpOutput,
  ResetPasswordOutput,
  ResetPasswordInput,
  resetPassword,
} from 'aws-amplify/auth';
import { actions } from 'xstate';
import { trimValues } from '../../helpers';

import {
  ActorContextWithForms,
  AuthEvent,
  SignInContext,
  SignUpContext,
  CodeDeliveryDetails,
  V6AuthDeliveryMedium,
  ChallengeName,
} from '../../types';
import { groupLog } from '../../utils';

const { assign, stop } = actions;

export const stopActor = (machineId: string) => {
  return stop(machineId);
};

/**
 * https://github.com/statelyai/xstate/issues/866
 *
 * Actions in Xstate take in two arguments - a `context` and
 * an `event`.
 *
 * When writing reusable actions in a separate file for Xstate,
 * you cannot specify the type for both the `context` and the `event`.
 * The bug has been around for 2 years with seemingly no resolution
 * in sight.
 *
 * TypeScript apparently has trouble inferring Xstate properly.
 * So, when writing actions, only specify the type for either `context`
 * or `event` - but not both.
 *
 * https://xstate.js.org/docs/guides/typescript.html#assign-action-behaving-strangely
 *
 * Each of the actions NEEDS at least the `context` argument in the
 * `assign` body - even if it is unused. This is another known bug in
 * how TypeScript integrate with Xstate.
 */

/**
 * "clear" actions
 */
export const clearAttributeToVerify = assign({
  attributeToVerify: (_) => undefined,
});
export const clearChallengeName = assign({
  challengeName: (_) => {
    groupLog('+++clearChallengeName');
    return undefined;
  },
});
export const clearRequiredAttributes = assign({
  requiredAttributes: (_) => {
    groupLog('+++clearRequiredAttributes');
    return undefined;
  },
});
export const clearError = assign({ remoteError: (_) => '' });
export const clearFormValues = assign({ formValues: (_) => ({}) });
export const clearTouched = assign({ touched: (_) => ({}) });
export const clearUnverifiedContactMethods = assign({
  unverifiedContactMethods: (_) => undefined,
});
export const clearUsername = assign({ username: (_) => undefined });
export const clearValidationError = assign({ validationError: (_) => ({}) });

/**
 * "set" actions
 */
export const setTotpSecretCode = assign({
  totpSecretCode: (ctx, event: AuthEvent) => {
    groupLog('+++setTotpSecretCode', ctx, event);
    return event.data;
  },
});

export const setChallengeName = assign({
  challengeName: (_, event: AuthEvent): ChallengeName | string => {
    groupLog(`+++setChallengeName: ${event.data.nextStep.signInStep}`);

    // map v6 `signInStep` to v5 `challengeName`
    const { signInStep } = event.data.nextStep;
    return signInStep === 'CONFIRM_SIGN_IN_WITH_SMS_CODE'
      ? 'SMS_MFA'
      : signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE'
      ? 'SOFTWARE_TOKEN_MFA'
      : signInStep;
  },
});

export const setRequiredAttributes = assign({
  requiredAttributes: (_, event: AuthEvent) => {
    groupLog('+++setRequiredAttributes', 'event', event);
    return event.data?.nextStep?.missingAttributes;
  },
});

export const setConfirmResetPasswordIntent = assign({
  redirectIntent: (_, __) => {
    groupLog('+++setConfirmResetPasswordIntent', 'event', __);
    return 'confirmPasswordReset';
  },
});

export const setConfirmSignUpIntent = assign({
  redirectIntent: (_, event) => {
    groupLog('+++setConfirmSignUpIntent', 'event', event);
    return 'confirmSignUp';
  },
});

export const setCredentials = assign({
  /**
   * @migration does not require updates
   */
  authAttributes: (context: SignInContext | SignUpContext) => {
    groupLog('+++setCredentials');
    const [primaryAlias] = context.loginMechanisms;
    const username =
      context.formValues[primaryAlias] ?? context.formValues['username'];
    const password = context.formValues?.password;

    return { username, password };
  },
});

export const setFieldErrors = assign({
  validationError: (_, event: AuthEvent) => event.data,
});

export const setRemoteError = assign({
  remoteError: (_, event: AuthEvent) => {
    groupLog('+++setRemoteError', 'event', event);
    if (event.data.name === 'NoUserPoolError') {
      return `Configuration error (see console) – please contact the administrator`;
    }
    return event.data?.message || event.data;
  },
});

export const setUnverifiedContactMethods = assign({
  unverifiedContactMethods: (_, event: AuthEvent) => {
    groupLog('+++setUnverifiedContactMethods', 'event', event);
    const { phone_number_verified, email_verified, email, phone_number } =
      event.data as FetchUserAttributesOutput;

    return {
      ...(email_verified === 'false' && email && { email }),
      ...(phone_number_verified === 'false' &&
        phone_number && { phone_number }),
    };
  },
});

// @todo-migration fix-me
export const setUser = assign({
  user: (_, event: AuthEvent) => {
    groupLog('+++setUser.source', 'event.data', event.data);

    /**
     * @migration Cannot be called if unauthenticated. Maybe try/catch?
     */
    // const user = await getCurrentUser();
    /**
     * @migration event.data was the fallback here,
     *  setting the entire event.data as user
     */
    return { ...event.data };
  },
});

export const setUsername = assign({
  username: (context: ActorContextWithForms, _) => {
    groupLog('+++setUsername', 'context', context);
    let {
      formValues: { username, country_code },
    } = context;
    if (country_code) {
      username = `${country_code}${username}`;
    }
    return username;
  },
});

export const setCodeDeliveryDetails = assign({
  codeDeliveryDetails: (_, { data }: { data: SignUpOutput }) => {
    groupLog('+++setCodeDeliveryDetails', 'data', data);
    const { codeDeliveryDetails: details } = data.nextStep as {
      codeDeliveryDetails: {
        destination?: string;
        deliveryMedium?: V6AuthDeliveryMedium;
        attributName?: string;
      };
    };

    // map `details` property names to PascalCase to prevent changes in UI layer
    const mappedDetails: CodeDeliveryDetails = {
      Destination: details.destination,
      DeliveryMedium: details.deliveryMedium,
      AttributeName: details.attributName,
    };

    return mappedDetails;
  },
});

export const setUsernameAuthAttributes = assign({
  authAttributes: (context: ActorContextWithForms, _) => {
    groupLog('+++setUsernameAuthAttributes', 'context', context, 'event', _);
    return {
      username: context.formValues.username,
    };
  },
});

export const handleInput = assign({
  formValues: (context, event: AuthEvent) => {
    const { name, value } = event.data;

    return {
      ...context['formValues'],
      [name]: value,
    };
  },
});

export const handleSubmit = assign({
  formValues: (context, event: AuthEvent) => {
    const formValues = {
      ...context['formValues'],
      ...event.data,
    };
    return trimValues(formValues, 'password'); // do not trim password
  },
});

export const handleBlur = assign({
  touched: (context, event: AuthEvent) => {
    const { name } = event.data;
    return {
      ...context['touched'],
      [`${name}`]: true,
    };
  },
});

// export const resendCode = async (context) => {
//   const { username } = context;
//   return await forgotPassword(username);
// };
/**
 *
 * @migration is working as expected
 */
export const resendCode = async (context): Promise<ResetPasswordOutput> => {
  const input: ResetPasswordInput = { ...context };
  return await resetPassword(input);
};

/**
 * This action occurs on the entry to a state where a form submit action
 * occurs. It combines the phone_number and country_code form values, parses
 * the result, and updates the form values with the full phone number which is
 * the required format by Cognito for form submission.
 */
export const parsePhoneNumber = assign({
  formValues: (context: SignInContext | SignUpContext, _) => {
    const [primaryAlias = 'username'] = context.loginMechanisms;

    if (!context.formValues.phone_number && primaryAlias !== 'phone_number')
      return context.formValues;

    const { formValues, country_code: defaultCountryCode } = context;
    const phoneAlias = formValues.phone_number ? 'phone_number' : 'username';

    const parsedPhoneNumber = `${
      formValues.country_code ?? defaultCountryCode
    }${formValues[phoneAlias]}`.replace(/[^A-Z0-9+]/gi, '');

    const updatedFormValues = {
      ...formValues,
      [phoneAlias]: parsedPhoneNumber,
    };
    delete updatedFormValues.country_code;

    return updatedFormValues;
  },
});
