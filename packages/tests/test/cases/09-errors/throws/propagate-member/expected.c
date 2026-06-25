#include "runtime.h"

typedef struct { TscError _base; } IOError;
typedef struct { int32_t code; } Data;
typedef struct { bool ok; union { Data value; IOError error; }; } Result_Data_IOError;
typedef struct { bool ok; union { int32_t value; IOError error; }; } Result_i32_IOError;

static Data Data_new(int32_t c) {
    Data self = {0};
    self.code = c;
    return self;
}

Result_Data_IOError getData(void) {
    return (Result_Data_IOError){.ok = true, .value = Data_new(42)};
}

Result_i32_IOError caller(void) {
    Result_Data_IOError _res_0 = getData();
    if (!_res_0.ok) { return (Result_i32_IOError){.ok = false, .error = _res_0.error}; }
    return (Result_i32_IOError){.ok = true, .value = _res_0.value.code};
}

int main(void) {
    TSC_INIT();
    return 0;
}
