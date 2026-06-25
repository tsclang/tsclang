#include "runtime.h"

typedef struct { bool ok; union { int32_t value; TscError error; }; } Result_i32_TscError;

typedef struct { int32_t _state; Result_i32_TscError _result; bool _done; } mayFail_state;

static void mayFail_poll(mayFail_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = (Result_i32_TscError){.ok = true, .value = 10};
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int32_t _result; bool _done;
    int32_t i;
    mayFail_state _await_0;
} tryBreak_state;

static void tryBreak_poll(tryBreak_state *self) {
    switch (self->_state) {
        case 0:
            self->i = 0;
            self->_state = 1;
            /* fall through */
case_1:
        case 1:
            if (!(self->i < 10)) { goto while_1_end; }
            self->i = self->i + 1;
            self->_await_0 = (mayFail_state){0};
            self->_state = 2;
            /* fall through */
        case 2:
            mayFail_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            int32_t v = self->_await_0._result.value;
            if (v == 10) goto while_1_end;
            if (!self->_await_0._result.ok) {
                (void)self->_await_0._result.error;
                goto while_1_end;
            }
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
