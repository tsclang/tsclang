#include "runtime.h"

typedef struct { TscError _base; } ErrA;
static ErrA ErrA_new(String msg) { ErrA s = {0}; s._base.message = msg; return s; }

typedef struct { TscError _base; } ErrB;
static ErrB ErrB_new(String msg) { ErrB s = {0}; s._base.message = msg; return s; }

typedef enum { _Err_ErrA = 0, _Err_ErrB = 1 } _ErrTag_ErrA_ErrB;
typedef struct {
    _ErrTag_ErrA_ErrB tag;
    union { ErrA _0; ErrB _1; };
} _ErrUnion_ErrA_ErrB;

typedef struct {
    bool ok;
    union { int _dummy; _ErrUnion_ErrA_ErrB error; };
} Result_void_ErrA_ErrB;

Result_void_ErrA_ErrB fail(void) {
    _ErrUnion_ErrA_ErrB _err = {.tag = _Err_ErrA, ._0 = ErrA_new(STR_LIT("a"))};
    return (Result_void_ErrA_ErrB){.ok = false, .error = _err};
}

int main(void) {
    TSC_INIT();
    Result_void_ErrA_ErrB _res_0 = fail();
    if (!_res_0.ok) {
        printf("caught\n");
    }
    return 0;
}
