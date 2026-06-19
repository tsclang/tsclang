#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { int32_t value; } Container;
typedef struct { bool ok; union { Container value; IOError error; }; } Result_Container_IOError;
typedef struct { bool ok; union { int32_t value; IOError error; }; } Result_i32_IOError;

static Container Container_new(int32_t v) {
    Container self = {0};
    self.value = v;
    return self;
}

Result_Container_IOError getData(void) {
    return (Result_Container_IOError){.ok = true, .value = Container_new(42)};
}

Result_i32_IOError run(void) {
    Result_Container_IOError _res_0 = getData();
    if (!_res_0.ok) { return (Result_i32_IOError){.ok = false, .error = _res_0.error}; }
    return (Result_i32_IOError){.ok = true, .value = _res_0.value.value};
}

int main(void) {
    TSC_INIT();
    return 0;
}
