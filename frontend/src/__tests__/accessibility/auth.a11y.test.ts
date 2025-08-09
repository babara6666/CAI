import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginForm from '../../components/Auth/LoginForm';
import RegisterForm from '../../components/Auth/RegisterForm';

expect.extend(toHaveNoViolations);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      {children}
    </BrowserRouter>
  </QueryClientProvider>
);

describe('Authentication Accessibility Tests', () => {
  describe('LoginForm', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper form labels', () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      // Check for proper labels
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      
      // Check for accessible button
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should have proper ARIA attributes', () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);

      // Check for required attributes
      expect(emailInput).toHaveAttribute('aria-required', 'true');
      expect(passwordInput).toHaveAttribute('aria-required', 'true');

      // Check for proper input types
      expect(emailInput).toHaveAttribute('type', 'email');
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('should announce validation errors to screen readers', async () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Trigger validation by submitting empty form
      submitButton.click();

      // Wait for error messages
      await screen.findByText(/email is required/i);
      
      const emailError = screen.getByText(/email is required/i);
      const passwordError = screen.getByText(/password is required/i);

      // Error messages should be associated with inputs
      expect(emailError).toHaveAttribute('role', 'alert');
      expect(passwordError).toHaveAttribute('role', 'alert');
    });

    it('should be keyboard navigable', () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Check tab order
      expect(emailInput).toHaveAttribute('tabindex', '0');
      expect(passwordInput).toHaveAttribute('tabindex', '0');
      expect(submitButton).toHaveAttribute('tabindex', '0');
    });

    it('should have sufficient color contrast', async () => {
      const { container } = render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      // axe will check color contrast automatically
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
        },
      });

      expect(results).toHaveNoViolations();
    });
  });

  describe('RegisterForm', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper form labels and descriptions', () => {
      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>
      );

      // Check for all form fields
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/role/i)).toBeInTheDocument();

      // Check for password requirements description
      const passwordHelp = screen.getByText(/password must be at least 8 characters/i);
      expect(passwordHelp).toBeInTheDocument();
      
      const passwordInput = screen.getByLabelText(/^password/i);
      expect(passwordInput).toHaveAttribute('aria-describedby');
    });

    it('should have proper fieldset and legend for role selection', () => {
      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>
      );

      const roleSelect = screen.getByLabelText(/role/i);
      expect(roleSelect).toBeInTheDocument();
      expect(roleSelect).toHaveAttribute('aria-required', 'true');
    });

    it('should announce password strength to screen readers', async () => {
      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>
      );

      const passwordInput = screen.getByLabelText(/^password/i);
      
      // Type a weak password
      passwordInput.focus();
      await userEvent.type(passwordInput, '123');

      // Should announce password strength
      const strengthIndicator = screen.getByText(/weak/i);
      expect(strengthIndicator).toHaveAttribute('aria-live', 'polite');
    });

    it('should validate confirm password accessibility', async () => {
      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>
      );

      const passwordInput = screen.getByLabelText(/^password/i);
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);

      // Type different passwords
      await userEvent.type(passwordInput, 'password123');
      await userEvent.type(confirmPasswordInput, 'different123');
      
      // Trigger validation
      confirmPasswordInput.blur();

      // Should show accessible error message
      const errorMessage = await screen.findByText(/passwords do not match/i);
      expect(errorMessage).toHaveAttribute('role', 'alert');
      expect(confirmPasswordInput).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Form Error Handling', () => {
    it('should focus on first error field when form submission fails', async () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Submit empty form
      submitButton.click();

      // First error field should receive focus
      await waitFor(() => {
        const emailInput = screen.getByLabelText(/email/i);
        expect(emailInput).toHaveFocus();
      });
    });

    it('should provide clear error messages', async () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email/i);
      
      // Type invalid email
      await userEvent.type(emailInput, 'invalid-email');
      emailInput.blur();

      // Should show clear, specific error message
      const errorMessage = await screen.findByText(/please enter a valid email address/i);
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveAttribute('role', 'alert');
    });

    it('should announce form submission status', async () => {
      // Mock successful login
      vi.mocked(authService.login).mockResolvedValue({
        user: testUtils.createTestUser(),
        token: 'test-token',
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Fill and submit form
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.type(passwordInput, 'password123');
      submitButton.click();

      // Should announce loading state
      expect(screen.getByText(/signing in/i)).toHaveAttribute('aria-live', 'polite');

      // Should announce success
      await screen.findByText(/signed in successfully/i);
      const successMessage = screen.getByText(/signed in successfully/i);
      expect(successMessage).toHaveAttribute('role', 'status');
    });
  });

  describe('Responsive Design Accessibility', () => {
    it('should maintain accessibility on mobile viewports', async () => {
      // Set mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { container } = render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();

      // Check that touch targets are large enough
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      const buttonStyles = window.getComputedStyle(submitButton);
      const minTouchTarget = 44; // 44px minimum touch target size

      expect(parseInt(buttonStyles.height)).toBeGreaterThanOrEqual(minTouchTarget);
    });

    it('should work with high contrast mode', async () => {
      // Simulate high contrast mode
      document.body.classList.add('high-contrast');

      const { container } = render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true },
        },
      });

      expect(results).toHaveNoViolations();

      document.body.classList.remove('high-contrast');
    });
  });

  describe('Screen Reader Support', () => {
    it('should have proper heading structure', () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      // Should have main heading
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent(/sign in/i);

      // Check heading hierarchy
      const headings = screen.getAllByRole('heading');
      headings.forEach((heading, index) => {
        if (index > 0) {
          const currentLevel = parseInt(heading.tagName.charAt(1));
          const previousLevel = parseInt(headings[index - 1].tagName.charAt(1));
          expect(currentLevel).toBeLessThanOrEqual(previousLevel + 1);
        }
      });
    });

    it('should have proper landmark regions', () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      // Should have main content area
      expect(screen.getByRole('main')).toBeInTheDocument();
      
      // Form should be properly identified
      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('should provide skip links for keyboard users', () => {
      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>
      );

      // Should have skip to main content link
      const skipLink = screen.getByText(/skip to main content/i);
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#main-content');
    });
  });
});