#include "runtime.h"

typedef struct { TscError _base; } GenErr;
static GenErr GenErr_new(String msg) { GenErr s = {0}; s._base.message = msg; return s; }

typedef struct { bool ok; union { int32_t value; GenErr error; }; } Result_i32_GenErr;
typedef struct { int32_t _state; bool _done; Result_i32_GenErr _result; } safe_state;
typedef struct { Result_i32_GenErr value; bool done; } safe_result;

static safe_result safe_next(safe_state *self) {
    switch (self->_state) {
        case 0:
            self->_state = 1;
            return (safe_result){(Result_i32_GenErr){.ok = true, .value = 1}, false};
        case 1:
            self->_done = true;
            return (safe_result){(Result_i32_GenErr){.ok = false, .error = GenErr_new(STR_LIT("oops"))}, true};
    }
    return (safe_result){(Result_i32_GenErr){.ok = false}, true};
}

int main(void) {
    TSC_INIT();
    return 0;
}
