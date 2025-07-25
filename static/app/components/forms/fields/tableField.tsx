import {Component, Fragment} from 'react';
import styled from '@emotion/styled';

import Confirm from 'sentry/components/confirm';
import {Alert} from 'sentry/components/core/alert';
import {Button} from 'sentry/components/core/button';
import {Input} from 'sentry/components/core/input';
import FormField from 'sentry/components/forms/formField';
import type {TableType} from 'sentry/components/forms/types';
import {IconAdd, IconDelete} from 'sentry/icons';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {defined} from 'sentry/utils';
import {singleLineRenderer} from 'sentry/utils/marked/marked';
import {isEmptyObject} from 'sentry/utils/object/isEmptyObject';

// XXX(epurkhiser): This is wrong, it should not be inheriting these props
import type {InputFieldProps} from './inputField';

interface DefaultProps {
  /**
   * Text used for the 'add' button. An empty string can be used
   * to just render the "+" icon.
   */
  addButtonText: string;
  /**
   * Automatically save even if fields are empty
   */
  allowEmpty: boolean;
}

export interface TableFieldProps extends Omit<InputFieldProps, 'type'> {}

interface RenderProps extends TableFieldProps, DefaultProps, Omit<TableType, 'type'> {}

const DEFAULT_PROPS: DefaultProps = {
  addButtonText: t('Add Item'),
  allowEmpty: false,
};

export default class TableField extends Component<InputFieldProps> {
  static defaultProps = DEFAULT_PROPS;

  hasValue = (value: any) => defined(value) && !isEmptyObject(value);

  renderField = (props: RenderProps) => {
    const {
      onChange,
      onBlur,
      addButtonText,
      columnLabels,
      columnKeys,
      disabled: rawDisabled,
      allowEmpty,
      confirmDeleteMessage,
    } = props;

    const mappedKeys = columnKeys || [];
    const emptyValue = mappedKeys.reduce((a, v) => ({...a, [v]: null}), {id: ''});

    const valueIsEmpty = this.hasValue(props.value);
    const value = valueIsEmpty ? (props.value as any[]) : [];

    const saveChanges = (nextValue: Array<Record<PropertyKey, unknown>>) => {
      onChange?.(nextValue, []);

      // nextValue is an array of ObservableObjectAdministration objects
      const validValues = !Object.values(nextValue)
        .flatMap(Object.entries)
        .some(
          ([key, val]) => key !== 'id' && !val // don't allow empty values except if it's the ID field
        );

      if (allowEmpty || validValues) {
        // TOOD: add debouncing or use a form save button
        onBlur?.(nextValue, []);
      }
    };

    const addRow = () => {
      saveChanges([...value, emptyValue]);
    };

    const removeRow = (rowIndex: any) => {
      const newValue = [...value];
      newValue.splice(rowIndex, 1);
      saveChanges(newValue);
    };

    const setValue = (
      rowIndex: number,
      fieldKey: string,
      fieldValue: React.FormEvent<HTMLInputElement>
    ) => {
      const newValue = [...value];
      newValue[rowIndex][fieldKey] = fieldValue.currentTarget
        ? fieldValue.currentTarget.value
        : null;
      saveChanges(newValue);
    };

    // should not be a function for this component
    const disabled = typeof rawDisabled === 'function' ? false : rawDisabled;

    const button = (
      <Button icon={<IconAdd isCircled />} onClick={addRow} size="xs" disabled={disabled}>
        {addButtonText}
      </Button>
    );

    // The field will be set to inline when there is no value set for the
    // field, just show the button.
    if (!valueIsEmpty) {
      return <div>{button}</div>;
    }

    const renderConfirmMessage = () => {
      return (
        <Fragment>
          <Alert.Container>
            <Alert type="error" showIcon={false}>
              <span
                dangerouslySetInnerHTML={{
                  __html: singleLineRenderer(
                    confirmDeleteMessage ||
                      t('Are you sure you want to delete this item?')
                  ),
                }}
              />
            </Alert>
          </Alert.Container>
        </Fragment>
      );
    };

    return (
      <Fragment>
        <HeaderContainer>
          {mappedKeys.map((fieldKey, i) => (
            <Header key={fieldKey}>
              <HeaderLabel>{columnLabels?.[fieldKey]}</HeaderLabel>
              {i === mappedKeys.length - 1 && button}
            </Header>
          ))}
        </HeaderContainer>
        {value.map((row, rowIndex) => (
          <RowContainer data-test-id="field-row" key={rowIndex}>
            {mappedKeys.map((fieldKey: string, i: number) => (
              <Row key={fieldKey}>
                <RowInput>
                  <Input
                    onChange={v => setValue(rowIndex, fieldKey, v)}
                    value={defined(row[fieldKey]) ? row[fieldKey] : ''}
                    // Do not forward required to `input` to avoid default browser behavior
                    required={undefined}
                  />
                </RowInput>
                {i === mappedKeys.length - 1 && (
                  <Confirm
                    priority="danger"
                    disabled={disabled}
                    onConfirm={() => removeRow(rowIndex)}
                    message={renderConfirmMessage()}
                  >
                    <RemoveButton>
                      <Button
                        icon={<IconDelete />}
                        size="sm"
                        disabled={disabled}
                        aria-label={t('delete')}
                      />
                    </RemoveButton>
                  </Confirm>
                )}
              </Row>
            ))}
          </RowContainer>
        ))}
      </Fragment>
    );
  };

  render() {
    // We need formatMessageValue=false since we're saving an object
    // and there isn't a great way to render the
    // change within the toast. Just turn off displaying the from/to portion of
    // the message
    return (
      <FormField
        {...this.props}
        formatMessageValue={false}
        inline={({model}: any) => !this.hasValue(model.getValue(this.props.name))}
      >
        {this.renderField}
      </FormField>
    );
  }
}

const HeaderLabel = styled('div')`
  font-size: 0.8em;
  text-transform: uppercase;
  color: ${p => p.theme.subText};
`;

const HeaderContainer = styled('div')`
  display: flex;
  align-items: center;
`;

const Header = styled('div')`
  display: flex;
  flex: 1 0 0;
  align-items: center;
  justify-content: space-between;
`;

const RowContainer = styled('div')`
  display: flex;
  align-items: center;
  margin-top: ${space(1)};
`;

const Row = styled('div')`
  display: flex;
  flex: 1 0 0;
  align-items: center;
  margin-top: ${space(1)};
`;

const RowInput = styled('div')`
  flex: 1;
  margin-right: ${space(1)};
`;

const RemoveButton = styled('div')`
  margin-left: ${space(1)};
`;
