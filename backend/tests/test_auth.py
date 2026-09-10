from app.core.config import settings


def test_login_success(client_fixture):
    response = client_fixture.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={
            "username": "director@test.local",
            "password": "DirectorPass123!",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["access_token"]
    assert payload["token_type"] == "bearer"
    assert payload["role"] == "DIRECTOR"


def test_login_wrong_password(client_fixture):
    response = client_fixture.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={
            "username": "director@test.local",
            "password": "wrong-password",
        },
    )
    assert response.status_code == 400


def test_login_blocked_when_session_active(client_fixture):
    credentials = {
        "username": "director@test.local",
        "password": "DirectorPass123!",
    }
    first = client_fixture.post(
        f"{settings.API_V1_STR}/login/access-token",
        data=credentials,
    )
    assert first.status_code == 200
    second = client_fixture.post(
        f"{settings.API_V1_STR}/login/access-token",
        data=credentials,
    )
    assert second.status_code == 409
    assert "sesión activa" in second.json()["detail"].lower()
    client_fixture.post(
        f"{settings.API_V1_STR}/users/logout",
        headers={"Authorization": f"Bearer {first.json()['access_token']}"},
    )


def test_login_unknown_email(client_fixture):
    response = client_fixture.post(
        f"{settings.API_V1_STR}/login/access-token",
        data={
            "username": "nobody@test.local",
            "password": "DirectorPass123!",
        },
    )
    assert response.status_code == 400


def test_protected_endpoint_without_token(client_fixture):
    response = client_fixture.get(f"{settings.API_V1_STR}/users/me")
    assert response.status_code == 401


def test_protected_endpoint_with_token(client_fixture, auth_header_director):
    response = client_fixture.get(
        f"{settings.API_V1_STR}/users/me",
        headers=auth_header_director,
    )
    assert response.status_code == 200
    assert response.json()["email"] == "director@test.local"
