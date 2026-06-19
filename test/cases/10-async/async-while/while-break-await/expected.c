#include "runtime.h"

typedef struct { int32_t _state; int32_t _result; bool _done; } getValue_state;

static void getValue_poll(getValue_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = 42;
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    int32_t i;
    getValue_state _await_0;
} findFirst_state;

static void findFirst_poll(findFirst_state *self) {
    switch (self->_state) {
        case 0:
            self->i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(self->i < 10)) { goto while_1_end; }
            self->_await_0 = (getValue_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            getValue_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t v = self->_await_0._result;
            if (v == 42) goto while_1_end;
            self->i = self->i + 1;
            self->_state = 1;
            goto case_1;
while_1_end:
            self->_result = self->i;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
