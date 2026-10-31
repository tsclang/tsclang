#include "runtime.h"

typedef struct { bool _done; String _result; bool _ok; String _error; } Promise_string;
extern Promise_string httpGet(String url);

typedef struct { int32_t _state; String _result; bool _done; String url; } fetch_state;

int main(void) {
    TSC_INIT();
    return 0;
}
