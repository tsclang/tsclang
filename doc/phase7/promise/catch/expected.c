#include "runtime.h"

typedef struct { TscError _base; } Err;
static Err Err_new(String msg) { Err s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int _dummy; Err error; }; } Result_void_Err;
typedef struct { int32_t _state; Result_void_Err _result; bool _done; } fail_state;

static void fail_poll(fail_state *self) {
    switch (self->_state) {
        case 0:
            self->_result = (Result_void_Err){.ok = false, .error = Err_new(STR_LIT("boom"))};
            self->_done = true;
            return;
    }
}

typedef struct {
    int32_t _state; int _result; bool _done;
    fail_state _await_0;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->_await_0 = (fail_state){0};
            self->_state = 1;
        case 1:
            fail_poll(&self->_await_0);
            if (!self->_await_0._done) return;
            if (!self->_await_0._result.ok) {
                Err e = self->_await_0._result.error;
                printf("caught\n");
            }
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}
